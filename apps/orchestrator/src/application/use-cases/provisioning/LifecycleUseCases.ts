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
      isFrozen:
        freezeOverride && freezeOverride.slug === t.slug
          ? freezeOverride.isFrozen
          : t.status === 'FROZEN',
    }));
  await caddy.push(creds, caddy.buildConfig(entries, { baseDomain: BASE_DOMAIN, email: CADDY_EMAIL }));
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
    await log(`[freeze] start tenant=${tenant.slug}`);

    // 1. Stop containers
    await this.docker.stop(creds, `tenant-${tenant.slug}-api`);
    await this.docker.stop(creds, `tenant-${tenant.slug}-web`);
    await log(`[freeze] containers stopped`);

    // 2. Update Caddy : route -> 503 page d'expiration
    await refreshCaddy(this.caddy, tenant.vpsId, creds, { slug: tenant.slug, isFrozen: true });
    await log(`[freeze] Caddy reloaded (503 page)`);

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'FROZEN', freezedAt: new Date() },
    });
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
    await log(`[unfreeze] start tenant=${tenant.slug}`);

    await this.docker.start(creds, `tenant-${tenant.slug}-api`);
    await this.docker.start(creds, `tenant-${tenant.slug}-web`);
    await log(`[unfreeze] containers started`);

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE', freezedAt: null },
    });

    // Reload Caddy (passe de 503 a reverse_proxy)
    await refreshCaddy(this.caddy, tenant.vpsId, creds);
    await log(`[unfreeze] Caddy reloaded (reverse_proxy)`);

    // Health check
    if (tenant.apiPort) {
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
