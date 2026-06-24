import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { DockerService, DOCKER_SERVICE } from '../../../infrastructure/docker/DockerService';
import { CaddyService, CADDY_SERVICE, type TenantCaddyEntry } from '../../../infrastructure/caddy/CaddyService';
import { SSHService, SSH_SERVICE, type SshConnection } from '../../../infrastructure/ssh/SSHService';
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
    @inject(SSH_SERVICE) private ssh: SSHService,
    private jobLogger: ProvisioningJobLogger,
  ) {}

  async execute(tenantId: string, jobId: string): Promise<void> {
    const log = (msg: string) => this.jobLogger.append(jobId, msg);
    const { tenant, creds } = await getCredsAndTenant(tenantId);
    await log(`[delete] start tenant=${tenant.slug}`);

    const slug = tenant.slug;
    // compose + env sont ecrits par le provisioning dans tenantEnvDir (PAS
    // vpsWorkDir). Utiliser le mauvais chemin laissait le vrai compose/env
    // derriere -> fichiers orphelins au recreate.
    const composeFilePath = `${config.tenantEnvDir}/tenant-${slug}-compose.yml`;
    const composeProjectName = `tenant-${slug}`;
    const envFile = `${config.tenantEnvDir}/tenant-${slug}.env`;
    const allContainers = [
      `tenant-${slug}-api`,
      `tenant-${slug}-web`,
      `tenant-${slug}-web-client`,
      `tenant-${slug}-postgres`,
      `tenant-${slug}-redis`,
      `tenant-${slug}-minio`,
    ];
    const volumes = [
      `tenant-${slug}-pgdata`,
      `tenant-${slug}-redisdata`,
      `tenant-${slug}-miniodata`,
    ];
    const networkName = `tenant-${slug}-net`;

    // 1. compose down avec --remove-orphans + -v (volumes) + --rmi local
    //    (images sans tag, ne touche pas postgres/redis/minio officielles).
    //    Sans ca, le rollback post-fail laissait des conteneurs zombies
    //    qui retenaient les ports + volumes orphelins.
    await this.ssh
      .exec(
        creds,
        `docker compose -p ${composeProjectName} -f ${composeFilePath} down --remove-orphans -t 5 -v --rmi local 2>/dev/null || true`,
      )
      .catch(() => {/* noop */});

    // 2. Force-remove tous les containers (garde-fou si compose file absent)
    for (const c of allContainers) {
      await this.docker.remove(creds, c, true).catch(() => {/* noop */});
    }
    await log(`[delete] containers removed (api/web/web-client/postgres/redis/minio)`);

    // 3. Remove volumes nommes (donnees tenant). Idempotent.
    await this.ssh
      .exec(
        creds,
        `for v in ${volumes.join(' ')}; do docker volume rm -f "$v" 2>/dev/null || true; done`,
      )
      .catch(() => {/* noop */});
    await log(`[delete] volumes removed (pgdata/redisdata/miniodata)`);

    // 4. Remove network compose
    await this.ssh
      .exec(creds, `docker network rm ${networkName} 2>/dev/null || true`)
      .catch(() => {/* noop */});

    // 5. Cleanup fichiers : env + compose + seed
    await this.ssh
      .exec(
        creds,
        `rm -f ${composeFilePath} ${envFile} ${config.vpsWorkDir}/seed-${slug}.js ${config.vpsWorkDir}/seed-${slug}.json 2>/dev/null || true`,
      )
      .catch(() => {/* noop */});
    await log(`[delete] files cleaned (compose + env + seed)`);

    // 6. (Legacy) Drop DB partagee si jamais le tenant utilisait l'ancien
    //    schema (shared postgres). No-op pour les tenants neufs (chaque
    //    tenant a son propre container postgres, vire au step 1).
    const dbName = tenant.dbName ?? `tenant_${slug.replace(/-/g, '_')}_db`;
    await this.docker
      .exec(creds, 'postgres', `psql -U \${POSTGRES_USER:-postgres} -c 'DROP DATABASE IF EXISTS "${dbName}"'`)
      .catch(() => {/* best-effort */});
    await log(`[delete] DB ${dbName} dropped (legacy shared PG, no-op si stack isolee)`);

    // 7. Update Caddy (retire le tenant)
    await refreshCaddy(this.caddy, tenant.vpsId, creds);
    await log(`[delete] Caddy reloaded (tenant retire)`);

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    await log(`[delete] DONE tenant=${slug} ARCHIVED`);
  }
}

/**
 * Suppression DEFINITIVE d'un tenant : containers + volumes + network + images
 * locales + env file + compose file + DB Postgres orchestrator (record tenant).
 *
 * Difference avec DeleteTenantUseCase :
 *  - DeleteTenant : soft, status=ARCHIVED, garde le record + tenant rows
 *    historiques (subscriptions, jobs, etc.) pour audit.
 *  - PurgeTenant  : hard, supprime physiquement TOUT et le record tenant
 *    lui-meme. Aucun retour possible. Audit a faire AVANT l'appel.
 *
 * A reserver aux operations de nettoyage / RGPD / desabonnement explicite.
 */
@injectable()
export class PurgeTenantUseCase {
  constructor(
    @inject(DOCKER_SERVICE) private docker: DockerService,
    @inject(CADDY_SERVICE) private caddy: CaddyService,
    @inject(SSH_SERVICE) private ssh: SSHService,
    private jobLogger: ProvisioningJobLogger,
  ) {}

  async execute(tenantId: string, jobId: string): Promise<void> {
    const log = (msg: string) => this.jobLogger.append(jobId, msg);
    const { tenant, creds } = await getCredsAndTenant(tenantId);
    if ((tenant as { isMain?: boolean }).isMain) {
      throw new BusinessError('Impossible de purger le tenant principal');
    }
    await log(`[purge] start tenant=${tenant.slug} (HARD DELETE)`);

    const slug = tenant.slug;
    // compose + env sont ecrits par le provisioning dans tenantEnvDir (PAS
    // vpsWorkDir). Utiliser le mauvais chemin laissait le vrai compose/env
    // derriere -> fichiers orphelins au recreate.
    const composeFilePath = `${config.tenantEnvDir}/tenant-${slug}-compose.yml`;
    const composeProjectName = `tenant-${slug}`;
    const envFile = `${config.tenantEnvDir}/tenant-${slug}.env`;
    const containers = [
      `tenant-${slug}-api`,
      `tenant-${slug}-web`,
      `tenant-${slug}-web-client`,
      `tenant-${slug}-postgres`,
      `tenant-${slug}-redis`,
      `tenant-${slug}-minio`,
    ];
    const volumes = [
      `tenant-${slug}-pgdata`,
      `tenant-${slug}-redisdata`,
      `tenant-${slug}-miniodata`,
    ];
    const networkName = `tenant-${slug}-net`;

    // 1. docker compose down --remove-orphans -v --rmi local
    //    Retire containers + volumes + images locales en une seule passe.
    //    `--rmi local` = supprime uniquement les images sans tag (build local).
    //    Les images officielles (postgres/redis/minio/optipack-api) sont
    //    laissees -- elles servent encore aux autres tenants.
    await log(`[purge] docker compose down -v --remove-orphans`);
    await this.ssh.exec(
      creds,
      `docker compose -p ${composeProjectName} -f ${composeFilePath} down --remove-orphans -t 5 -v --rmi local 2>/dev/null || true`,
    );

    // 2. rm -f par nom (garde-fou si compose file manque ou project deplace)
    await log(`[purge] force-remove containers`);
    for (const c of containers) {
      await this.docker.remove(creds, c, true).catch(() => {/* noop */});
    }

    // 3. Volumes nommes (declares par compose avec name: explicite)
    await log(`[purge] remove named volumes`);
    await this.ssh.exec(
      creds,
      `for v in ${volumes.join(' ')}; do docker volume rm -f "$v" 2>/dev/null || true; done`,
    );

    // 4. Network compose
    await log(`[purge] remove network ${networkName}`);
    await this.ssh.exec(
      creds,
      `docker network rm ${networkName} 2>/dev/null || true`,
    );

    // 5. Cleanup fichiers VPS : compose file + env file
    await log(`[purge] cleanup files (compose + env)`);
    await this.ssh.exec(
      creds,
      `rm -f ${composeFilePath} ${envFile} ${config.vpsWorkDir}/seed-${slug}.js ${config.vpsWorkDir}/seed-${slug}.json 2>/dev/null || true`,
    );

    // 6. Update Caddy (retire le tenant de la config full-replace)
    await log(`[purge] reload Caddy config sans ${slug}`);
    await refreshCaddy(this.caddy, tenant.vpsId, creds);

    // 7. Delete record tenant + cascade (subscriptions, jobs, etc. via FK)
    //    Best-effort sur les FK qui n'ont pas onDelete: Cascade defini cote
    //    schema. On supprime les enfants explicitement pour eviter
    //    PrismaClientKnownRequestError P2003.
    await log(`[purge] delete tenant record + dependances`);
    await prisma.$transaction(async (tx) => {
      await tx.provisioningJob.deleteMany({ where: { tenantId } });
      await tx.planChange.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.subscription.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.tenantUpdateJob.deleteMany({ where: { tenantId } }).catch(() => {});
      await tx.tenant.delete({ where: { id: tenantId } });
    });

    await log(`[purge] DONE tenant=${slug} (record supprime, volumes purges)`);
  }
}
