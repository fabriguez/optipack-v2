import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { BusinessError, ConflictError, NotFoundError } from '../../../domain/errors/BusinessError';
import { SSHService, SSH_SERVICE } from '../../../infrastructure/ssh/SSHService';
import {
  provisionQueue,
  freezeQueue,
  unfreezeQueue,
  deleteQueue,
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

@injectable()
export class TenantUseCases {
  constructor(@inject(SSH_SERVICE) private ssh: SSHService) {}

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

    const tenant = await prisma.tenant.create({
      data: {
        slug: input.slug,
        name: input.name,
        ownerEmail: input.ownerEmail,
        ownerUsername: input.ownerUsername,
        vpsId: input.vpsId,
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
            pricePerMonth: input.pricePerMonth ?? 0,
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
