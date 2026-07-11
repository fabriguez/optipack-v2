import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { logger } from '../../../infrastructure/logger';
import { DockerService, DOCKER_SERVICE } from '../../../infrastructure/docker/DockerService';
import { SshKeyEncryption } from '../../../infrastructure/crypto/SshKeyEncryption';
import { PortAllocator } from '../../../infrastructure/provisioning/PortAllocator';
import { ReconcileCaddyUseCase } from '../caddy/ReconcileCaddyUseCase';
import type { SshConnection } from '../../../infrastructure/ssh/SSHService';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

/**
 * Déploie le SITE CUSTOM d'un tenant : git sync -> docker build -> lancement
 * dans un projet compose SEPARE (`tenant-<slug>-site`) avec son propre réseau
 * -> reconcile Caddy (le site prend les hosts publics) -> health check.
 *
 * Isolation : le container tourne sur un réseau Docker dédié, sans env_file ni
 * accès aux secrets/DB du tenant, avec limites CPU/RAM. Le projet compose est
 * distinct du stack applicatif -> un update tenant ne peut pas le toucher.
 *
 * Concurrence : la queue SITE_DEPLOY dédup par tenant (jobId deterministe), donc
 * ce use-case ne tourne jamais deux fois en parallèle pour un même tenant.
 */
@injectable()
export class DeploySiteUseCase {
  constructor(
    @inject(DOCKER_SERVICE) private docker: DockerService,
    private portAllocator: PortAllocator,
    private reconcileCaddy: ReconcileCaddyUseCase,
  ) {}

  async execute(tenantId: string, trigger: 'manual' | 'webhook'): Promise<void> {
    const jobRow = await prisma.siteDeployJob.create({
      data: { tenantId, trigger, status: 'building', startedAt: new Date() },
    });
    const jobId = jobRow.id;
    const log = (msg: string) => this.appendLog(jobId, msg);

    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { vps: true, site: true },
      });
      if (!tenant) throw new NotFoundError('Tenant', tenantId);
      if (!tenant.vps) throw new BusinessError('Tenant sans VPS associe');
      if (!tenant.site) throw new BusinessError('Aucun site custom configuré pour ce tenant');

      const site = tenant.site;
      const creds: SshConnection = {
        host: tenant.vps.host,
        port: tenant.vps.port,
        username: tenant.vps.username,
        sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
      };

      await prisma.tenantSite.update({ where: { tenantId }, data: { status: 'building', lastError: null } });
      await log(`[site] start tenant=${tenant.slug} repo=${site.repoUrl} branch=${site.branch} trigger=${trigger}`);

      // 1. Alloue un port site si pas déjà fait (idempotent).
      let sitePort = site.sitePort ?? 0;
      if (!sitePort) {
        sitePort = await this.portAllocator.allocateOne(tenant.vpsId);
        await prisma.tenantSite.update({ where: { tenantId }, data: { sitePort } });
        await log(`[site] port alloué ${sitePort} -> container:${site.containerPort}`);
      }

      // 2. Git sync sur le VPS (clone/pull + checkout) -> SHA HEAD.
      const destDir = `${config.tenantEnvDir}/sites/${tenant.slug}`;
      const token = site.repoTokenEnc ? SshKeyEncryption.decrypt(site.repoTokenEnc) : undefined;
      await log(`[site] git sync -> ${destDir}`);
      const sha = await this.docker.gitSync(creds, {
        repoUrl: site.repoUrl,
        branch: site.branch,
        destDir,
        token,
      });
      await log(`[site] HEAD ${sha.slice(0, 12)}`);

      // Webhook + SHA inchangé + déjà live : rien à rebuild (debounce des pushes
      // sur d'autres branches / commits vides). Un redeploy MANUEL force toujours.
      if (trigger === 'webhook' && sha && sha === site.lastDeploySha && site.status === 'live') {
        await log('[site] SHA inchangé, déjà live -> skip build');
        await prisma.tenantSite.update({ where: { tenantId }, data: { status: 'live' } });
        await this.finish(jobId, sha, 'succeeded');
        return;
      }

      // 3. Build de l'image sur le VPS.
      const envVars = this.decryptEnv(site.envVarsEnc);
      const buildContext = site.buildContext ? `${destDir}/${site.buildContext}` : destDir;
      const tag = `tenant-${tenant.slug}-site:${(sha || 'latest').slice(0, 12)}`;
      await log(`[site] docker build ${tag} (context=${buildContext} dockerfile=${site.dockerfilePath})`);
      await this.docker.buildImage(creds, {
        contextDir: buildContext,
        dockerfilePath: site.dockerfilePath,
        tag,
        buildArgs: envVars,
      });

      // 4. Lancement dans un projet compose SEPARE + réseau isolé.
      const composeFilePath = `${config.tenantEnvDir}/tenant-${tenant.slug}-site-compose.yml`;
      const projectName = `tenant-${tenant.slug}-site`;
      const composeYaml = this.renderSiteCompose({
        slug: tenant.slug,
        tag,
        sitePort,
        containerPort: site.containerPort,
        cpuLimit: site.cpuLimit,
        memoryMb: site.memoryMb,
        env: envVars,
      });
      await log(`[site] docker compose up (project=${projectName})`);
      await this.docker.composeUp(creds, composeFilePath, composeYaml, projectName);

      // 5. Health check sur le port host.
      await log(`[site] health check http://127.0.0.1:${sitePort}${site.healthPath}`);
      const ok = await this.docker.healthCheck(creds, sitePort, site.healthPath, 90);
      if (!ok) throw new Error(`Le site ne répond pas sur ${site.healthPath} après build (health check timeout)`);

      // 6. Marque live PUIS reconcile Caddy (le mapper route les hosts publics
      //    vers le site seulement si status === 'live').
      await prisma.tenantSite.update({
        where: { tenantId },
        data: { status: 'live', lastDeploySha: sha, lastDeployAt: new Date(), lastError: null },
      });
      await log('[site] reconcile Caddy (hosts publics -> site custom)');
      await this.reconcileCaddy.execute({ vpsId: tenant.vpsId });

      await this.finish(jobId, sha, 'succeeded');
      await log(`[site] DONE tenant=${tenant.slug} live sur port ${sitePort}`);
      logger.info({ tenantId, slug: tenant.slug, sha }, '[site] deploy ok');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.appendLog(jobId, `[ERROR] ${msg}`);
      await prisma.tenantSite
        .update({ where: { tenantId }, data: { status: 'failed', lastError: msg } })
        .catch(() => {/* le site peut ne pas exister */});
      await prisma.siteDeployJob.update({
        where: { id: jobId },
        data: { status: 'failed', finishedAt: new Date(), errorLog: msg },
      });
      logger.error({ tenantId, err: msg }, '[site] deploy failed');
      throw err;
    }
  }

  private async finish(jobId: string, sha: string, status: 'succeeded'): Promise<void> {
    await prisma.siteDeployJob.update({
      where: { id: jobId },
      data: { status, finishedAt: new Date(), commitSha: sha || null },
    });
  }

  private decryptEnv(enc: string | null): Record<string, string> {
    if (!enc) return {};
    try {
      const raw = SshKeyEncryption.decrypt(enc);
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) out[k] = String(v);
      return out;
    } catch {
      return {};
    }
  }

  /**
   * Compose du site custom. Volontairement SANS env_file tenant et SANS le
   * réseau du stack applicatif : réseau dédié -> aucun accès aux secrets / à la
   * DB / au MinIO du tenant. Limites CPU/RAM appliquées.
   */
  private renderSiteCompose(o: {
    slug: string;
    tag: string;
    sitePort: number;
    containerPort: number;
    cpuLimit: number;
    memoryMb: number;
    env: Record<string, string>;
  }): string {
    const envLines = Object.entries(o.env)
      .map(([k, v]) => `      ${k}: ${JSON.stringify(v)}`)
      .join('\n');
    const envBlock = envLines ? `    environment:\n${envLines}\n` : '';
    return `services:
  site:
    container_name: tenant-${o.slug}-site
    image: ${o.tag}
    restart: unless-stopped
    ports:
      - "127.0.0.1:${o.sitePort}:${o.containerPort}"
${envBlock}    networks:
      - site
    cpus: ${o.cpuLimit}
    mem_limit: ${o.memoryMb}m
networks:
  site:
    name: tenant-${o.slug}-site-net
`;
  }

  private async appendLog(jobId: string, msg: string): Promise<void> {
    const line = `${new Date().toISOString()} ${msg}`;
    logger.info({ jobId }, `[site] ${msg}`);
    // Append atomique-ish : lit puis réécrit. Volume de logs faible (1 build).
    const row = await prisma.siteDeployJob.findUnique({ where: { id: jobId }, select: { logs: true } });
    const logs = row?.logs ? `${row.logs}\n${line}` : line;
    await prisma.siteDeployJob.update({ where: { id: jobId }, data: { logs } });
  }
}
