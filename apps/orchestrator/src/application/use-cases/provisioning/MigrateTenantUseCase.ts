import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { DockerService, DOCKER_SERVICE } from '../../../infrastructure/docker/DockerService';
import { CaddyService, CADDY_SERVICE, type TenantCaddyEntry } from '../../../infrastructure/caddy/CaddyService';
import { SSHService, SSH_SERVICE, type SshConnection } from '../../../infrastructure/ssh/SSHService';
import { ScpService, SCP_SERVICE } from '../../../infrastructure/ssh/ScpService';
import { PortAllocator } from '../../../infrastructure/provisioning/PortAllocator';
import { ProvisioningJobLogger } from './ProvisioningJobLogger';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

const BASE_DOMAIN = process.env.OPS_BASE_DOMAIN ?? 'transitsoftservices.com';
const CADDY_EMAIL = process.env.OPS_CADDY_EMAIL ?? `admin@${BASE_DOMAIN}`;

/**
 * Migration cross-VPS d'un tenant. Sequence :
 *
 *  1. Freeze cote source (containers stop, Caddy 503)
 *  2. pg_dump sur source -> /tmp/tenant-<slug>.sql
 *  3. Transfer SCP via orchestrateur -> /tmp/tenant-<slug>.sql sur target
 *  4. Sur target : creer DB, restaurer dump
 *  5. Sur target : pull images, demarrer containers (memes ports si libres, sinon nouveaux)
 *  6. Update Caddy target (ajouter le tenant)
 *  7. Update Caddy source (retirer le tenant)
 *  8. Health check target
 *  9. Cleanup source : remove containers, drop DB, remove dump file
 *  10. Update tenant.vpsId = targetVpsId, status = ACTIVE
 *
 * IMPORTANT : downtime pendant la fenetre. Pour reduire :
 *   - dump small : ~1s par MB
 *   - SCP via orchestrateur : ~10MB/s
 *   - container start : ~10s
 *   - Pour un tenant avec 50MB de DB : ~30s downtime total
 *
 * En cas de fail apres etape 4 (DB cree sur target), on rollback : retirer DB target,
 * unfreeze source. Le tenant reste sur l'ancien VPS.
 */
@injectable()
export class MigrateTenantUseCase {
  constructor(
    @inject(SSH_SERVICE) private ssh: SSHService,
    @inject(DOCKER_SERVICE) private docker: DockerService,
    @inject(CADDY_SERVICE) private caddy: CaddyService,
    @inject(SCP_SERVICE) private scp: ScpService,
    private portAllocator: PortAllocator,
    private jobLogger: ProvisioningJobLogger,
  ) {}

  async execute(tenantId: string, jobId: string, targetVpsId: string): Promise<void> {
    const log = (msg: string) => this.jobLogger.append(jobId, msg);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { vps: true },
    });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    if (!tenant.vps) throw new BusinessError('Tenant sans VPS source');
    if (tenant.vpsId === targetVpsId) throw new BusinessError('VPS cible identique au VPS source');

    const targetVps = await prisma.vPS.findUnique({ where: { id: targetVpsId } });
    if (!targetVps) throw new NotFoundError('VPS cible', targetVpsId);
    if (targetVps.status !== 'ACTIVE') throw new BusinessError('VPS cible inactif');

    const sourceCreds: SshConnection = {
      host: tenant.vps.host,
      port: tenant.vps.port,
      username: tenant.vps.username,
      sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
    };
    const targetCreds: SshConnection = {
      host: targetVps.host,
      port: targetVps.port,
      username: targetVps.username,
      sshKeyEncrypted: targetVps.sshKeyEncrypted,
    };

    const slug = tenant.slug;
    const dbName = tenant.dbName ?? `tenant_${slug.replace(/-/g, '_')}_db`;
    const apiName = `tenant-${slug}-api`;
    const webName = `tenant-${slug}-web`;
    const pgName = `tenant-${slug}-postgres`;
    const dumpPath = `/tmp/tenant-${slug}-${Date.now()}.sql`;

    await log(`[migrate] start tenant=${slug} ${tenant.vps.host} -> ${targetVps.host}`);

    // 1. Freeze source (downtime debut)
    await log(`[migrate] step 1: freeze source containers`);
    await this.docker.stop(sourceCreds, apiName);
    await this.docker.stop(sourceCreds, webName);

    let dbCreatedOnTarget = false;
    try {
      // 2. pg_dump source
      await log(`[migrate] step 2: pg_dump ${dbName}`);
      const dumpResult = await this.ssh.exec(
        sourceCreds,
        `PGUSER=$(docker exec ${pgName} printenv POSTGRES_USER 2>/dev/null || echo postgres); docker exec ${pgName} pg_dump -U "$PGUSER" -F c "${dbName}" > ${dumpPath}`,
      );
      if (dumpResult.code !== 0) {
        throw new Error(`pg_dump echoue : ${dumpResult.stderr}`);
      }
      const sizeResult = await this.ssh.exec(sourceCreds, `wc -c < ${dumpPath}`);
      await log(`[migrate] dump size: ${sizeResult.stdout.trim()} bytes`);

      // 3. Transfer via orchestrateur
      await log(`[migrate] step 3: SCP transfer via orchestrator`);
      await this.scp.transfer(sourceCreds, targetCreds, dumpPath, dumpPath);

      // 4. Creer DB sur target + restore
      await log(`[migrate] step 4: CREATE DATABASE + pg_restore on target`);
      await this.ssh.exec(
        targetCreds,
        `PGUSER=$(docker exec ${pgName} printenv POSTGRES_USER 2>/dev/null || echo postgres); docker exec ${pgName} psql -U "$PGUSER" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='${dbName}'" | grep -q 1 || docker exec ${pgName} psql -U "$PGUSER" -d postgres -c 'CREATE DATABASE "${dbName}"'`,
      );
      dbCreatedOnTarget = true;
      const restoreResult = await this.ssh.exec(
        targetCreds,
        `PGUSER=$(docker exec ${pgName} printenv POSTGRES_USER 2>/dev/null || echo postgres); cat ${dumpPath} | docker exec -i ${pgName} pg_restore -U "$PGUSER" -d "${dbName}" --clean --if-exists`,
      );
      if (restoreResult.code !== 0) {
        await log(`[migrate] WARN restore : ${restoreResult.stderr}`);
      }

      // 5. Allocation ports sur target + run containers
      await log(`[migrate] step 5: allocate ports on target + run containers`);
      const { apiPort, webPort } = await this.portAllocator.allocate(targetVpsId);

      // Pull images sur target
      if (config.ghcr.pullToken) {
        await this.docker.loginGhcr(targetCreds, config.ghcr.namespace, config.ghcr.pullToken);
      }
      const apiImage = `ghcr.io/${config.ghcr.namespace}/optipack-api:latest`;
      const webImage = `ghcr.io/${config.ghcr.namespace}/optipack-web:latest`;
      await this.docker.pull(targetCreds, apiImage);
      await this.docker.pull(targetCreds, webImage);

      // Recreer le env file sur target (memes secrets : on copie le fichier source)
      const envFile = `${config.tenantEnvDir}/tenant-${slug}.env`;
      await this.scp.transfer(sourceCreds, targetCreds, envFile, envFile);
      await this.ssh.exec(targetCreds, `chmod 600 ${envFile}`);

      // Run containers sur target
      await this.docker.run(targetCreds, {
        name: apiName,
        image: apiImage,
        ports: { [apiPort]: 4000 },
        envFile,
        restart: 'unless-stopped',
        network: 'optipack-shared',
      });
      await this.docker.run(targetCreds, {
        name: webName,
        image: webImage,
        ports: { [webPort]: 3000 },
        env: {
          TENANT_SLUG: slug,
          NEXT_PUBLIC_API_URL: `https://api.${slug}.${BASE_DOMAIN}/api/v1`,
        },
        restart: 'unless-stopped',
        network: 'optipack-shared',
      });

      // Update tenant.vpsId + ports en BDD
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { vpsId: targetVpsId, apiPort, webPort, status: 'PROVISIONING' },
      });

      // 6. Caddy target : ajouter
      await log(`[migrate] step 6: Caddy reload on target`);
      await this.refreshCaddy(targetVpsId, targetCreds);

      // 7. Caddy source : retirer
      await log(`[migrate] step 7: Caddy reload on source (retrait)`);
      await this.refreshCaddy(tenant.vpsId, sourceCreds);

      // 8. Health check target
      await log(`[migrate] step 8: health check target`);
      const ok = await this.docker.healthCheck(targetCreds, apiPort, '/api/v1/tenant-meta', 90);
      if (!ok) {
        throw new Error('Health check target timeout. Migration aborted.');
      }

      // 9. Cleanup source
      await log(`[migrate] step 9: cleanup source (containers, DB, dump)`);
      await this.docker.remove(sourceCreds, apiName, true);
      await this.docker.remove(sourceCreds, webName, true);
      await this.ssh
        .exec(
          sourceCreds,
          `PGUSER=$(docker exec ${pgName} printenv POSTGRES_USER 2>/dev/null || echo postgres); docker exec ${pgName} psql -U "$PGUSER" -d postgres -c 'DROP DATABASE IF EXISTS "${dbName}"'`,
        )
        .catch(() => undefined);
      await this.scp.deleteRemote(sourceCreds, dumpPath);
      await this.scp.deleteRemote(targetCreds, dumpPath);

      // 10. Status ACTIVE
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'ACTIVE' },
      });
      await log(`[migrate] DONE tenant=${slug} migrated to vps=${targetVps.host}`);
    } catch (err) {
      // Rollback : si on a deja cree la DB sur target, on la drop pour ne pas laisser d'orphelin.
      // On ne touche pas a la source : ses containers stop, mais le DROP DATABASE n'a pas ete fait.
      // L'admin pourra unfreeze la source pour reprendre l'activite.
      const msg = err instanceof Error ? err.message : String(err);
      await log(`[migrate] ROLLBACK : ${msg}`);
      if (dbCreatedOnTarget) {
        await this.ssh
          .exec(
            targetCreds,
            `PGUSER=$(docker exec ${pgName} printenv POSTGRES_USER 2>/dev/null || echo postgres); docker exec ${pgName} psql -U "$PGUSER" -d postgres -c 'DROP DATABASE IF EXISTS "${dbName}"'`,
          )
          .catch(() => undefined);
        await this.docker.remove(targetCreds, apiName, true).catch(() => undefined);
        await this.docker.remove(targetCreds, webName, true).catch(() => undefined);
      }
      // Remettre tenant en FROZEN (manuel : l'ops doit unfreeze pour redemarrer la source)
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'FROZEN', freezedAt: new Date() },
      });
      throw err;
    }
  }

  private async refreshCaddy(vpsId: string, creds: SshConnection): Promise<void> {
    const tenants = await prisma.tenant.findMany({
      where: { vpsId, status: { in: ['ACTIVE', 'FROZEN', 'PROVISIONING', 'MIGRATING'] } },
    });
    const entries: TenantCaddyEntry[] = tenants
      .filter((t) => t.apiPort && t.webPort)
      .map((t) => ({
        slug: t.slug,
        customDomain: t.customDomain,
        apiPort: t.apiPort!,
        webPort: t.webPort!,
        isFrozen: t.status === 'FROZEN',
      }));
    await this.caddy.push(creds, this.caddy.buildConfig(entries, { baseDomain: BASE_DOMAIN, email: CADDY_EMAIL }));
  }
}
