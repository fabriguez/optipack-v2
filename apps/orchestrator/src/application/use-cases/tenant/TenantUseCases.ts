import { inject, injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../../config/database';
import { BusinessError, ConflictError, NotFoundError } from '../../../domain/errors/BusinessError';
import { SSHService, SSH_SERVICE } from '../../../infrastructure/ssh/SSHService';
import {
  provisionQueue,
  freezeQueue,
  unfreezeQueue,
  deleteQueue,
  purgeQueue,
  migrateQueue,
} from '../../../infrastructure/queue/queues';

// Schemas + types migres dans @transitsoftservices/ops-schemas (partages
// avec le frontend ops-admin pour validation rhf+zodResolver coherente).
import {
  createTenantSchema,
  updateTenantSchema,
  migrateTenantSchema,
  type CreateTenantInput,
  type UpdateTenantInput,
  type MigrateTenantInput,
} from '@transitsoftservices/ops-schemas';
export { createTenantSchema, updateTenantSchema, migrateTenantSchema };
export type { CreateTenantInput, UpdateTenantInput, MigrateTenantInput };

import { DockerService, DOCKER_SERVICE } from '../../../infrastructure/docker/DockerService';

@injectable()
export class TenantUseCases {
  constructor(
    @inject(SSH_SERVICE) private ssh: SSHService,
    @inject(DOCKER_SERVICE) private docker: DockerService,
  ) {}

  /** Liste les containers du stack tenant via DockerService. */
  async listContainers(id: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: { vps: true },
    });
    if (!tenant || !tenant.vps) throw new NotFoundError('Tenant', id);
    const creds = {
      host: tenant.vps.host,
      port: tenant.vps.port,
      username: tenant.vps.username,
      sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
    };
    return this.docker.listTenantContainers(creds, tenant.slug);
  }

  private async tenantCreds(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id }, include: { vps: true } });
    if (!tenant || !tenant.vps) throw new NotFoundError('Tenant', id);
    const envDir = process.env.OPS_TENANT_ENV_DIR ?? '/home/brightky/.optipack';
    return {
      creds: {
        host: tenant.vps.host,
        port: tenant.vps.port,
        username: tenant.vps.username,
        sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
      },
      slug: tenant.slug,
      composeFilePath: `${envDir}/tenant-${tenant.slug}-compose.yml`,
      projectName: `tenant-${tenant.slug}`,
    };
  }

  async stackStop(id: string) {
    const { creds, composeFilePath, projectName } = await this.tenantCreds(id);
    await this.docker.composeStop(creds, composeFilePath, projectName);
  }

  async stackStart(id: string) {
    const { creds, composeFilePath, projectName } = await this.tenantCreds(id);
    await this.docker.composeStart(creds, composeFilePath, projectName);
  }

  async stackRestart(id: string) {
    const { creds, composeFilePath, projectName } = await this.tenantCreds(id);
    await this.docker.composeRestart(creds, composeFilePath, projectName);
  }

  /** docker logs <container> --tail N. Verifie que le container appartient au tenant. */
  async containerLogs(id: string, containerName: string, tail = 200) {
    const tenant = await this.assertTenantContainer(id, containerName);
    const creds = {
      host: tenant.vps!.host,
      port: tenant.vps!.port,
      username: tenant.vps!.username,
      sshKeyEncrypted: tenant.vps!.sshKeyEncrypted,
    };
    const r = await this.docker.logs(creds, containerName, tail);
    return { logs: r.stdout, code: r.code };
  }

  /** docker exec one-shot. Garde-fou : le container doit appartenir au tenant. */
  async containerExec(id: string, containerName: string, cmd: string) {
    const tenant = await this.assertTenantContainer(id, containerName);
    const creds = {
      host: tenant.vps!.host,
      port: tenant.vps!.port,
      username: tenant.vps!.username,
      sshKeyEncrypted: tenant.vps!.sshKeyEncrypted,
    };
    const r = await this.docker.execShell(creds, containerName, cmd);
    return { output: r.stdout, code: r.code };
  }

  /**
   * Verifie que le container appartient au stack tenant (prefix tenant-<slug>-).
   * Garde-fou contre attaque par injection de nom de container -> on ne laisse
   * pas un admin lire les logs / exec dans le container d'un autre tenant.
   */
  private async assertTenantContainer(id: string, containerName: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: { vps: true },
    });
    if (!tenant || !tenant.vps) throw new NotFoundError('Tenant', id);
    const expectedPrefix = `tenant-${tenant.slug}-`;
    if (!containerName.startsWith(expectedPrefix)) {
      throw new BusinessError(
        `Container ${containerName} n'appartient pas au tenant ${tenant.slug}`,
      );
    }
    return tenant;
  }

  /**
   * Cree le record du tenant (status PROVISIONING) + son abonnement.
   * Le job de provisioning reel (Docker, Caddy, etc.) sera enqueue en Phase 2.
   */
  async create(input: CreateTenantInput) {
    const vps = await prisma.vPS.findUnique({ where: { id: input.vpsId } });
    if (!vps) throw new NotFoundError('VPS', input.vpsId);
    if (vps.status !== 'ACTIVE') {
      throw new BusinessError('Ce VPS n\'est pas actif. Utilisez un autre.');
    }

    // Slug unique
    const dupSlug = await prisma.tenant.findUnique({ where: { slug: input.slug } });
    if (dupSlug) throw new ConflictError(`Le slug "${input.slug}" est deja pris`);

    // Custom domain unique (si fourni)
    if (input.customDomain) {
      const dupDomain = await prisma.tenant.findUnique({
        where: { customDomain: input.customDomain },
      });
      if (dupDomain) throw new ConflictError(`Le domaine "${input.customDomain}" est deja utilise`);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.trialDays ?? 14) * 24 * 60 * 60 * 1000);
    const dbName = `tenant_${input.slug.replace(/-/g, '_')}_db`;

    // Si un resourcePlanId est fourni, on copie ses limites comme prix
    // mensuel par defaut (UI les a deja affichees). Persistance du FK pour
    // que CapacityService.getTenantLimits retourne source='plan'.
    let pricePerMonth = input.pricePerMonth;
    if (input.resourcePlanId) {
      const plan = await prisma.resourcePlan.findUnique({
        where: { id: input.resourcePlanId },
      });
      if (!plan) {
        throw new NotFoundError('ResourcePlan', input.resourcePlanId);
      }
      if (!plan.isActive) {
        throw new BusinessError(`Plan "${plan.code}" inactif`);
      }
      pricePerMonth = pricePerMonth || Number(plan.pricePerMonth);
    }

    const tenant = await prisma.tenant.create({
      data: {
        slug: input.slug,
        name: input.name,
        ownerEmail: input.ownerEmail,
        ownerUsername: input.ownerUsername,
        vpsId: input.vpsId,
        ...(input.resourcePlanId && { resourcePlanId: input.resourcePlanId }),
        customDomain: input.customDomain ?? null,
        primaryColor: input.primaryColor ?? '#1B5E20',
        secondaryColor: input.secondaryColor ?? '#4CAF50',
        accentColor: input.accentColor ?? '#E8F5E9',
        enabledModules: input.enabledModules ?? [],
        logoUrl: input.logoUrl ?? null,
        dbName,
        status: 'PROVISIONING',
        subscription: {
          create: {
            plan: input.plan ?? 'starter',
            pricePerMonth: pricePerMonth ?? 0,
            startedAt: now,
            expiresAt,
          },
        },
      },
      include: { subscription: true, vps: { select: { id: true, name: true, host: true } } },
    });

    // Job de provisioning : record DB + enqueue BullMQ (Phase 2)
    const job = await prisma.provisioningJob.create({
      data: {
        tenantId: tenant.id,
        type: 'PROVISION',
        payload: {
          slug: tenant.slug,
          vpsId: tenant.vpsId,
          ownerEmail: tenant.ownerEmail,
        },
        status: 'queued',
      },
    });
    await provisionQueue.add(
      'provision',
      { tenantId: tenant.id, provisioningJobId: job.id },
      { jobId: job.id },
    );

    return tenant;
  }

  async list(filters: {
    status?: string;
    vpsId?: string;
    q?: string;
    page: number;
    pageSize: number;
  }) {
    const where = {
      ...(filters.status && { status: filters.status as never }),
      ...(filters.vpsId && { vpsId: filters.vpsId }),
      ...(filters.q && {
        OR: [
          { slug: { contains: filters.q, mode: 'insensitive' as const } },
          { name: { contains: filters.q, mode: 'insensitive' as const } },
          { ownerEmail: { contains: filters.q, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        include: {
          vps: { select: { id: true, name: true, host: true, status: true } },
          subscription: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.tenant.count({ where }),
    ]);
    return { items, total };
  }

  async getById(id: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        vps: true,
        subscription: { include: { payments: { orderBy: { createdAt: 'desc' }, take: 10 } } },
        jobs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!tenant) throw new NotFoundError('Tenant', id);
    return tenant;
  }

  async update(id: string, input: UpdateTenantInput) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundError('Tenant', id);

    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.customDomain !== undefined && { customDomain: input.customDomain }),
        ...(input.enabledModules !== undefined && { enabledModules: input.enabledModules }),
        ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
        ...(input.primaryColor !== undefined && { primaryColor: input.primaryColor }),
        ...(input.secondaryColor !== undefined && { secondaryColor: input.secondaryColor }),
        ...(input.accentColor !== undefined && { accentColor: input.accentColor }),
        ...(input.pinnedVersion !== undefined && { pinnedVersion: input.pinnedVersion }),
        ...(input.autoUpdatePolicy !== undefined && { autoUpdatePolicy: input.autoUpdatePolicy }),
        ...((input as any).skinId !== undefined && { skinId: (input as any).skinId } as any),
        ...((input as any).themeId !== undefined && { themeId: (input as any).themeId } as any),
        ...((input as any).skinCustomization !== undefined && {
          skinCustomization: (input as any).skinCustomization,
        } as any),
      },
    });

    // Best-effort propagation to the tenant's own Organization DB. The
    // orchestrator's Tenant table is the source of truth for ops-admin
    // changes, but the running tenant-api reads its branding/modules/skin
    // from its own Organization row. We fire-and-forget the sync so a
    // tenant being offline never blocks an ops save.
    void this.syncTenantOrg(updated, input).catch((err) => {
      console.error('[tenant.update] tenant-org sync failed', err);
    });

    return updated;
  }

  /**
   * Push the updated branding/modules/skin to the running tenant-api so the
   * customization actually shows up in the web app. Routed through
   * Caddy: https://api.{slug}.{BASE_DOMAIN}/api/v1/tenant-meta/ops-sync.
   * Auth via the shared OPS_TENANT_PROXY_TOKEN service token.
   */
  private async syncTenantOrg(
    t: { id: string; slug: string; customDomain: string | null; isMain?: boolean },
    input: UpdateTenantInput,
  ): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.logoUrl !== undefined) payload.logoUrl = input.logoUrl;
    if (input.primaryColor !== undefined) payload.primaryColor = input.primaryColor;
    if (input.secondaryColor !== undefined) payload.secondaryColor = input.secondaryColor;
    if (input.accentColor !== undefined) payload.accentColor = input.accentColor;
    if (input.enabledModules !== undefined) payload.enabledModules = input.enabledModules;
    if ((input as any).skinId !== undefined) payload.skinId = (input as any).skinId;
    if ((input as any).themeId !== undefined) payload.themeId = (input as any).themeId;
    if ((input as any).skinCustomization !== undefined) {
      payload.skinCustomization = (input as any).skinCustomization;
    }
    if (Object.keys(payload).length === 0) return;

    const token = process.env.OPS_TENANT_PROXY_TOKEN ?? '';
    if (!token) {
      // Sans token, le DB tenant ne sera jamais mis a jour -> le site continue
      // d'afficher l'ancien skin/branding. Avant : skip silencieux, impossible
      // a diagnostiquer cote ops. Maintenant : warn loud avec le tenant + les
      // champs modifies, pour qu'on voie clair dans les logs.
      console.warn(
        `[tenant.update] OPS_TENANT_PROXY_TOKEN absent -> sync ${t.slug} SKIP (champs: ${Object.keys(payload).join(',')}). Le site tenant ne sera PAS rafraichi.`,
      );
      return;
    }

    const base = process.env.BASE_DOMAIN ?? 'transitsoftservices.com';
    const apiHost = (t as { isMain?: boolean }).isMain
      ? `api.${base}`
      : t.customDomain
        ? `api.${t.customDomain}`
        : `api.${t.slug}.${base}`;
    const url = `https://${apiHost}/api/v1/tenant-meta/ops-sync`;

    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': token,
          'X-Tenant-Id': t.id,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn(
          `[tenant.update] sync ${t.slug} -> ${url} HTTP ${res.status} : ${body.slice(0, 200)}`,
        );
      } else {
        console.log(`[tenant.update] sync ${t.slug} OK (champs: ${Object.keys(payload).join(',')})`);
      }
    } catch (err) {
      // Tenant offline / DNS not ready: log only, don't fail the ops change.
      console.warn(`[tenant.update] sync to ${url} unreachable:`, (err as Error).message);
    }
  }

  async freeze(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundError('Tenant', id);
    if (tenant.status === 'FROZEN') return tenant;
    if (tenant.status === 'ARCHIVED') {
      throw new BusinessError('Impossible de freezer un tenant archive');
    }

    const job = await prisma.provisioningJob.create({
      data: { tenantId: id, type: 'FREEZE', payload: {}, status: 'queued' },
    });
    await freezeQueue.add('freeze', { tenantId: id, provisioningJobId: job.id }, { jobId: job.id });

    // Le worker fera la transition de statut effective. On retourne tenant tel quel.
    return tenant;
  }

  async unfreeze(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundError('Tenant', id);
    if (tenant.status !== 'FROZEN') {
      throw new BusinessError(`Statut actuel : ${tenant.status}. Le tenant n'est pas freeze.`);
    }

    const job = await prisma.provisioningJob.create({
      data: { tenantId: id, type: 'UNFREEZE', payload: {}, status: 'queued' },
    });
    await unfreezeQueue.add('unfreeze', { tenantId: id, provisioningJobId: job.id }, { jobId: job.id });

    return tenant;
  }

  async archive(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundError('Tenant', id);
    if (tenant.status === 'ARCHIVED') return tenant;

    const job = await prisma.provisioningJob.create({
      data: { tenantId: id, type: 'DELETE', payload: {}, status: 'queued' },
    });
    await deleteQueue.add('delete', { tenantId: id, provisioningJobId: job.id }, { jobId: job.id });

    return tenant;
  }

  /**
   * Reset le mot de passe owner du tenant. Appelle l'API tenant (service
   * token) qui genere une nouvelle pwd aleatoire + met a jour le hash. La
   * pwd plaintext est renvoyee a l'ops-admin une seule fois -- jamais
   * persistee cote orchestrator.
   */
  async resetOwnerPassword(id: string): Promise<{ email: string; password: string }> {
    const tenant = await prisma.tenant.findUnique({ where: { id }, include: { vps: true } });
    if (!tenant) throw new NotFoundError('Tenant', id);

    const token = process.env.OPS_TENANT_PROXY_TOKEN ?? '';
    if (!token) {
      throw new BusinessError(
        'OPS_TENANT_PROXY_TOKEN absent cote orchestrator -- reset impossible.',
      );
    }

    const base = process.env.BASE_DOMAIN ?? 'transitsoftservices.com';
    const apiHost = (tenant as { isMain?: boolean }).isMain
      ? `api.${base}`
      : tenant.customDomain
        ? `api.${tenant.customDomain}`
        : `api.${tenant.slug}.${base}`;
    const url = `https://${apiHost}/api/v1/tenant-meta/reset-owner-password`;

    const doCall = () =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': token,
          'X-Tenant-Id': tenant.id,
        },
        body: JSON.stringify({}),
      });

    let res = await doCall();

    // Self-heal : token absent du .env tenant (tenant provisionne avant ce fix).
    // SSH sur le VPS -> ajoute OPS_TENANT_PROXY_TOKEN dans le .env -> restart
    // le container API -> retente l appel.
    if (res.status === 503) {
      const bodyText = await res.text().catch(() => '');
      if (bodyText.includes('Service token non configure') && tenant.vps) {
        console.warn(`[resetOwnerPassword] 503 token absent pour ${tenant.slug} -- self-heal...`);
        const creds = {
          host: tenant.vps.host,
          port: tenant.vps.port,
          username: tenant.vps.username,
          sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
        };
        const envDir = process.env.OPS_TENANT_ENV_DIR ?? '/home/brightky/.optipack';
        const envFile = `${envDir}/tenant-${tenant.slug}.env`;
        const apiName = `tenant-${tenant.slug}-api`;
        // Ajoute le token seulement s'il n'est pas deja present, puis restart.
        const escapedToken = token.replace(/'/g, "'\\''");
        const patchCmd = `grep -q OPS_TENANT_PROXY_TOKEN ${envFile} 2>/dev/null || echo "OPS_TENANT_PROXY_TOKEN='${escapedToken}'" >> ${envFile} && docker restart ${apiName}`;
        const patchResult = await this.ssh.exec(creds, patchCmd);
        if (patchResult.code !== 0) {
          console.warn(`[resetOwnerPassword] patch env echoue: ${patchResult.stderr}`);
        } else {
          // Attendre que le container soit pret (~15s max)
          await new Promise<void>((resolve) => {
            let elapsed = 0;
            const iv = setInterval(async () => {
              elapsed += 2;
              try {
                const check = await this.ssh.exec(
                  creds,
                  `curl -fs --max-time 3 http://localhost:${tenant.apiPort}/api/v1/health >/dev/null 2>&1 && echo OK || echo WAIT`,
                );
                if ((check.stdout || '').trim() === 'OK' || elapsed >= 30) {
                  clearInterval(iv);
                  resolve();
                }
              } catch {
                if (elapsed >= 30) { clearInterval(iv); resolve(); }
              }
            }, 2000);
          });
        }
        res = await doCall();
      } else {
        throw new BusinessError(
          `Reset pwd echoue (${apiHost} HTTP ${res.status}) : ${bodyText.slice(0, 200)}`,
        );
      }
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new BusinessError(
        `Reset pwd echoue (${apiHost} HTTP ${res.status}) : ${body.slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as {
      success?: boolean;
      data?: { email: string; password: string };
      message?: string;
    };
    if (!json.success || !json.data) {
      throw new BusinessError(
        `Reset pwd : reponse invalide (${json.message ?? 'unknown'})`,
      );
    }
    return { email: json.data.email, password: json.data.password };
  }

  /**
   * Cree (ou met a jour l'email de) le compte facturation ops-admin scope a ce
   * tenant, et lui (re)genere un mot de passe. Idempotent : un seul compte
   * facturation par tenant. Retourne email + mot de passe en clair (one-shot).
   *
   * Reutilise au provisioning (creation auto) et via l'endpoint super-admin
   * (reset / creation pour tenants existants).
   */
  static async createOrResetBillingUser(
    tenantId: string,
    opts?: { email?: string; password?: string },
  ): Promise<{ email: string; password: string; created: boolean }> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, ownerEmail: true },
    });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);

    const email = (opts?.email ?? tenant.ownerEmail).trim().toLowerCase();
    const password = opts?.password ?? randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(password, 10);

    // Un compte facturation existe deja pour ce tenant ?
    const existing = await prisma.opsAdmin.findFirst({ where: { tenantId } });

    // Garde-fou : l'email cible ne doit pas appartenir a un AUTRE compte
    // (global ou d'un autre tenant) -> sinon collision unique sur email.
    const emailOwner = await prisma.opsAdmin.findUnique({ where: { email }, select: { id: true, tenantId: true } });
    if (emailOwner && emailOwner.id !== existing?.id) {
      throw new BusinessError(
        `L'email ${email} est deja utilise par un autre compte ops-admin. Choisissez un autre email.`,
      );
    }

    if (existing) {
      await prisma.opsAdmin.update({
        where: { id: existing.id },
        data: { email, passwordHash, isActive: true },
      });
      return { email, password, created: false };
    }

    await prisma.opsAdmin.create({
      data: {
        email,
        passwordHash,
        fullName: `Facturation ${email}`,
        isSuperAdmin: false,
        isActive: true,
        twoFactorEnabled: false,
        tenantId,
      },
    });
    return { email, password, created: true };
  }

  /** Infos du compte facturation tenant (existe ? email ? dernier login ?). */
  async getBillingUser(tenantId: string) {
    const user = await prisma.opsAdmin.findFirst({
      where: { tenantId },
      select: { id: true, email: true, isActive: true, lastLoginAt: true, createdAt: true },
    });
    return { exists: !!user, user };
  }

  /** (Re)genere le compte facturation tenant. Retourne creds one-shot. */
  async resetBillingUser(tenantId: string, email?: string) {
    return TenantUseCases.createOrResetBillingUser(tenantId, { email });
  }

  /**
   * Suppression DEFINITIVE : appelle PurgeTenantUseCase via la queue PURGE.
   * Le record tenant + volumes + images locales + env files sont detruits.
   * Aucun retour en arriere possible. Reserve aux super-admins.
   */
  async purge(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundError('Tenant', id);
    if ((tenant as { isMain?: boolean }).isMain) {
      throw new BusinessError('Impossible de purger le tenant principal');
    }

    const job = await prisma.provisioningJob.create({
      data: { tenantId: id, type: 'PURGE', payload: {}, status: 'queued' },
    });
    await purgeQueue.add('purge', { tenantId: id, provisioningJobId: job.id }, { jobId: job.id });

    return { id, jobId: job.id, slug: tenant.slug };
  }

  /**
   * Historique des jobs de provisioning du tenant (PROVISION, MIGRATE, FREEZE, etc.)
   */
  async listJobs(tenantId: string, limit = 50) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    return prisma.provisioningJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }

  /**
   * Recupere un job de provisioning unique avec ses logs complets.
   * Le frontend peut poll cet endpoint toutes les 1-2s pour afficher les
   * logs en temps reel pendant qu'un job tourne.
   */
  async getJob(tenantId: string, jobId: string) {
    const job = await prisma.provisioningJob.findFirst({
      where: { id: jobId, tenantId },
    });
    if (!job) throw new NotFoundError('ProvisioningJob', jobId);
    return job;
  }

  /**
   * Logs Docker live des conteneurs du tenant via SSH au VPS hote.
   * Utile pour debug rapide depuis ops-admin sans avoir a SSH manuel.
   */
  async getLogs(
    tenantId: string,
    options: { tail?: number; service?: 'api' | 'web' } = {},
  ): Promise<{ stdout: string; stderr: string }> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { vps: true },
    });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    if (!tenant.vps) throw new BusinessError('Tenant sans VPS associe');

    const tail = Math.min(Math.max(options.tail ?? 200, 1), 5000);
    const service = options.service ?? 'api';
    const containerName = `tenant-${tenant.slug}-${service}`;

    const result = await this.ssh.exec(
      {
        host: tenant.vps.host,
        port: tenant.vps.port,
        username: tenant.vps.username,
        sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
      },
      `docker logs --tail ${tail} ${containerName} 2>&1 || echo 'container not found: ${containerName}'`,
    );
    return { stdout: result.stdout, stderr: result.stderr };
  }

  async migrate(id: string, targetVpsId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundError('Tenant', id);
    if (tenant.vpsId === targetVpsId) {
      throw new BusinessError('Le tenant est deja sur ce VPS');
    }
    const target = await prisma.vPS.findUnique({ where: { id: targetVpsId } });
    if (!target) throw new NotFoundError('VPS cible', targetVpsId);
    if (target.status !== 'ACTIVE') throw new BusinessError('VPS cible inactif');

    const job = await prisma.provisioningJob.create({
      data: {
        tenantId: id,
        type: 'MIGRATE',
        payload: { fromVpsId: tenant.vpsId, toVpsId: targetVpsId },
        status: 'queued',
      },
    });
    await migrateQueue.add(
      'migrate',
      { tenantId: id, provisioningJobId: job.id, targetVpsId },
      { jobId: job.id },
    );

    return prisma.tenant.update({
      where: { id },
      data: { status: 'MIGRATING' },
    });
  }
}
