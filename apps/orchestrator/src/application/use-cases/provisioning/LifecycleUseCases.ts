import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { DockerService, DOCKER_SERVICE } from '../../../infrastructure/docker/DockerService';
import { CaddyService, CADDY_SERVICE, type TenantCaddyEntry } from '../../../infrastructure/caddy/CaddyService';
import { SshConnection } from '../../../infrastructure/ssh/SSHService';
import { ProvisioningJobLogger } from './ProvisioningJobLogger';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

const BASE_DOMAIN = process.env.OPS_BASE_DOMAIN ?? 'transitsoftservices.com';
const CADDY_EMAIL = process.env.OPS_CADDY_EMAIL ?? `admin@${BASE_DOMAIN}`;

async function getCredsAndTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { vps: true },
  });
  if (!tenant) throw new NotFoundError('Tenant', tenantId);
  if (!tenant.vps) throw new BusinessError('Tenant sans VPS associe');
  const creds: SshConnection = {
    host: tenant.vps.host,
    port: tenant.vps.port,
    username: tenant.vps.username,
    sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
  };
  return { tenant, creds };
}

const SELF_VPS_NAME = process.env.OPS_SELF_VPS_NAME ?? 'self';

async function refreshCaddy(
  caddy: CaddyService,
  vpsId: string,
  creds: SshConnection,
  freezeOverride?: { slug: string; isFrozen: boolean },
) {
  const tenants = await prisma.tenant.findMany({
    where: { vpsId, status: { in: ['ACTIVE', 'FROZEN', 'PROVISIONING'] } },
  });
  const entries: TenantCaddyEntry[] = tenants
    .filter((t) => t.apiPort && t.webPort)
    .map((t) => ({
      slug: t.slug,
      customDomain: t.customDomain,
      apiPort: t.apiPort!,
      webPort: t.webPort!,
      webClientPort: t.webClientPort ?? undefined,
      isFrozen:
        freezeOverride && freezeOverride.slug === t.slug
          ? freezeOverride.isFrozen
          : t.status === 'FROZEN',
      isMain: (t as { isMain?: boolean }).isMain ?? false,
    }));
  const config = caddy.buildConfig(entries, { baseDomain: BASE_DOMAIN, email: CADDY_EMAIL });
  // VPS local (self) -> push local. Sinon SSH.
  const vps = await prisma.vPS.findUnique({ where: { id: vpsId }, select: { name: true } });
  if (vps?.name === SELF_VPS_NAME) {
    await caddy.pushLocal(config);
  } else {
    await caddy.push(creds, config);
  }
}

@injectable()
export class FreezeTenantUseCase {
  constructor(
    @inject(DOCKER_SERVICE) private docker: DockerService,
    @inject(CADDY_SERVICE) private caddy: CaddyService,
    private jobLogger: ProvisioningJobLogger,
  ) {}

  async execute(tenantId: string, jobId: string): Promise<void> {
    const log = (msg: string) => this.jobLogger.append(jobId, msg);
    const { tenant, creds } = await getCredsAndTenant(tenantId);
    const isMain = (tenant as { isMain?: boolean }).isMain ?? false;
    const isSelfVps = tenant.vps?.name === SELF_VPS_NAME;
    await log(`[freeze] start tenant=${tenant.slug} isMain=${isMain} isSelfVps=${isSelfVps}`);

    // 1. Update BDD AVANT le push Caddy : si Caddy plante, la BDD reflete deja
    //    l'intention (le retry pourra finir le job).
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'FROZEN', freezedAt: new Date() },
    });
    await log(`[freeze] tenant marque FROZEN en BDD`);

    // 2. Stop containers. Pour le tenant principal (containers deployes via
    //    docker-compose.prod.yml sur l'host : api/web/web-client), l'orchestrator
    //    n'a pas d'acces docker direct -> on skip et on s'appuie uniquement sur
    //    Caddy renvoyant 503. Les containers restent up mais inaccessibles.
    if (isMain || isSelfVps) {
      await log(`[freeze] skip docker stop (tenant principal / VPS local : Caddy 503 suffit)`);
    } else {
      try {
        await this.docker.stop(creds, `tenant-${tenant.slug}-api`);
        await this.docker.stop(creds, `tenant-${tenant.slug}-web`);
        await this.docker.stop(creds, `tenant-${tenant.slug}-web-client`).catch(() => {/* legacy */});
        await log(`[freeze] containers stopped`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await log(`[freeze] WARN docker stop : ${msg} -- on continue avec Caddy 503`);
      }
    }

    // 3. Push Caddy : route -> 503
    await refreshCaddy(this.caddy, tenant.vpsId, creds, { slug: tenant.slug, isFrozen: true });
    await log(`[freeze] Caddy reloaded (503 page)`);

    await log(`[freeze] DONE tenant=${tenant.slug} FROZEN`);
  }
}

@injectable()
export class UnfreezeTenantUseCase {
  constructor(
    @inject(DOCKER_SERVICE) private docker: DockerService,
    @inject(CADDY_SERVICE) private caddy: CaddyService,
    private jobLogger: ProvisioningJobLogger,
  ) {}

  async execute(tenantId: string, jobId: string): Promise<void> {
    const log = (msg: string) => this.jobLogger.append(jobId, msg);
    const { tenant, creds } = await getCredsAndTenant(tenantId);
    const isMain = (tenant as { isMain?: boolean }).isMain ?? false;
    const isSelfVps = tenant.vps?.name === SELF_VPS_NAME;
    await log(`[unfreeze] start tenant=${tenant.slug} isMain=${isMain} isSelfVps=${isSelfVps}`);

    if (isMain || isSelfVps) {
      await log(`[unfreeze] skip docker start (tenant principal / VPS local : Caddy retire la 503)`);
    } else {
      try {
        await this.docker.start(creds, `tenant-${tenant.slug}-api`);
        await this.docker.start(creds, `tenant-${tenant.slug}-web`);
        await this.docker.start(creds, `tenant-${tenant.slug}-web-client`).catch(() => {/* legacy */});
        await log(`[unfreeze] containers started`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await log(`[unfreeze] WARN docker start : ${msg} -- on continue`);
      }
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE', freezedAt: null },
    });
    await log(`[unfreeze] tenant marque ACTIVE en BDD`);

    // Reload Caddy (passe de 503 a reverse_proxy)
    await refreshCaddy(this.caddy, tenant.vpsId, creds);
    await log(`[unfreeze] Caddy reloaded (reverse_proxy)`);

    // Health check (skip pour le tenant principal -- pas de SSH valide vers self)
    if (!isMain && !isSelfVps && tenant.apiPort) {
      const ok = await this.docker.healthCheck(creds, tenant.apiPort, '/api/v1/tenant-meta', 60);
      if (!ok) await log(`[unfreeze] WARN health check timeout`);
    }
    await log(`[unfreeze] DONE tenant=${tenant.slug} ACTIVE`);
  }
}

@injectable()
export class DeleteTenantUseCase {
  constructor(
    @inject(DOCKER_SERVICE) private docker: DockerService,
    @inject(CADDY_SERVICE) private caddy: CaddyService,
    private jobLogger: ProvisioningJobLogger,
  ) {}

  async execute(tenantId: string, jobId: string): Promise<void> {
    const log = (msg: string) => this.jobLogger.append(jobId, msg);
    const { tenant, creds } = await getCredsAndTenant(tenantId);
    await log(`[delete] start tenant=${tenant.slug}`);

    // 1. Stop + remove containers
    await this.docker.remove(creds, `tenant-${tenant.slug}-api`, true);
    await this.docker.remove(creds, `tenant-${tenant.slug}-web`, true);
    await log(`[delete] containers removed`);

    // 2. Drop DB tenant (DESTRUCTIF - pas de retour en arriere)
    const dbName = tenant.dbName ?? `tenant_${tenant.slug.replace(/-/g, '_')}_db`;
    await this.docker
      .exec(creds, 'postgres', `psql -U \${POSTGRES_USER:-postgres} -c 'DROP DATABASE IF EXISTS "${dbName}"'`)
      .catch(() => {/* best-effort */});
    await log(`[delete] DB ${dbName} dropped`);

    // 3. (TODO) Remove env file /etc/optipack/tenant-<slug>.env via SSH brut.
    //    Peu critique : le fichier orphelin ne nuit pas et facilite un eventuel restore.

    // 4. Update Caddy (retire le tenant)
    await refreshCaddy(this.caddy, tenant.vpsId, creds);
    await log(`[delete] Caddy reloaded (tenant retire)`);

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    await log(`[delete] DONE tenant=${tenant.slug} ARCHIVED`);
  }
}
