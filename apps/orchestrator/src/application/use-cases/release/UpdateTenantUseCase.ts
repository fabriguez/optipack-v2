import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { logger } from '../../../infrastructure/logger';
import { DockerService, DOCKER_SERVICE } from '../../../infrastructure/docker/DockerService';
import { SSHService, SSH_SERVICE, type SshConnection } from '../../../infrastructure/ssh/SSHService';
import { UpdateJobLogger } from './UpdateJobLogger';
import { CapacityService } from '../../services/CapacityService';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

const ROLLBACK_WINDOW_MIN = 30;

/**
 * Phase 4.5 — Update tenant vers une nouvelle release OptiPack.
 *
 * Sequence :
 *  1. Health check pre-update (refus si tenant deja KO)
 *  2. Backup auto : pg_dump → /tmp/tenant-<slug>-pre-<from>-<ts>.sql sur le VPS host
 *  3. docker pull nouvelles images
 *  4. Tag les anciennes images en `:previous` (pour rollback rapide)
 *  5. Stop containers actuels (downtime debut)
 *  6. Run prisma migrate deploy via container temporaire (nouvelle image)
 *  7. Si migrate fail → restore DB depuis backup + redemarrer ancien container → status=failed
 *  8. Run nouveaux containers (memes ports, memes limites de plan)
 *  9. Health check (90s timeout)
 *  10. Si OK : tenant.currentVersion = toVersion, job.status = succeeded, rollbackBefore = now+30min
 *  11. Si KO : rollback DB + ancien container → status=failed
 */
@injectable()
export class UpdateTenantUseCase {
  constructor(
    @inject(SSH_SERVICE) private ssh: SSHService,
    @inject(DOCKER_SERVICE) private docker: DockerService,
    private jobLogger: UpdateJobLogger,
    private capacity: CapacityService,
  ) {}

  async execute(jobId: string): Promise<void> {
    const log = (msg: string) => this.jobLogger.append(jobId, msg);

    const updateJob = await prisma.tenantUpdateJob.findUnique({ where: { id: jobId } });
    if (!updateJob) throw new NotFoundError('TenantUpdateJob', jobId);

    const tenant = await prisma.tenant.findUnique({
      where: { id: updateJob.tenantId },
      include: { vps: true },
    });
    if (!tenant) throw new NotFoundError('Tenant', updateJob.tenantId);
    if (!tenant.vps) throw new BusinessError('Tenant sans VPS');
    if (tenant.status !== 'ACTIVE') {
      throw new BusinessError(`Tenant doit etre ACTIVE pour update (current : ${tenant.status})`);
    }

    const targetRelease = await prisma.release.findUnique({ where: { version: updateJob.toVersion } });
    if (!targetRelease) throw new NotFoundError('Release', updateJob.toVersion);

    const creds: SshConnection = {
      host: tenant.vps.host,
      port: tenant.vps.port,
      username: tenant.vps.username,
      sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
    };

    const slug = tenant.slug;
    const dbName = tenant.dbName ?? `tenant_${slug.replace(/-/g, '_')}_db`;
    const apiName = `tenant-${slug}-api`;
    const webName = `tenant-${slug}-web`;
    const pgName = `tenant-${slug}-postgres`;
    const netName = `tenant-${slug}-net`;
    const fromVersion = tenant.currentVersion ?? 'unknown';
    const backupPath = `/tmp/tenant-${slug}-pre-${fromVersion}-${Date.now()}.sql`;

    await prisma.tenantUpdateJob.update({
      where: { id: jobId },
      data: { status: 'running', startedAt: new Date() },
    });
    await log(`[update] start ${slug} ${fromVersion} -> ${updateJob.toVersion}`);

    let backupTaken = false;
    let oldImagesTagged = false;
    let imagesPulled = false;
    try {
      // 1. Backup DB
      await log('[update] step 1: pg_dump backup');
      const dump = await this.ssh.exec(
        creds,
        `PGUSER=$(docker exec ${pgName} printenv POSTGRES_USER 2>/dev/null || echo postgres); docker exec ${pgName} pg_dump -U "$PGUSER" -F c "${dbName}" > ${backupPath}`,
      );
      if (dump.code !== 0) throw new Error(`pg_dump failed: ${dump.stderr}`);
      backupTaken = true;
      await prisma.tenantUpdateJob.update({
        where: { id: jobId },
        data: { backupRef: backupPath },
      });

      // 2. Pull nouvelles images
      await log(`[update] step 2: docker pull ${targetRelease.apiImageTag}`);
      if (config.ghcr.pullToken) {
        await this.docker.loginGhcr(creds, config.ghcr.namespace, config.ghcr.pullToken);
      }
      await this.docker.pull(creds, targetRelease.apiImageTag);
      await this.docker.pull(creds, targetRelease.webImageTag);
      imagesPulled = true;

      // 3. Tag les anciennes images :previous pour rollback rapide
      await log('[update] step 3: tag anciennes images :previous');
      await this.ssh.exec(
        creds,
        `docker inspect ${apiName} --format '{{.Image}}' | xargs -I {} docker tag {} ghcr.io/${config.ghcr.namespace}/optipack-api:previous-${slug}`,
      );
      await this.ssh.exec(
        creds,
        `docker inspect ${webName} --format '{{.Image}}' | xargs -I {} docker tag {} ghcr.io/${config.ghcr.namespace}/optipack-web:previous-${slug}`,
      );
      oldImagesTagged = true;

      // 4. Stop containers (downtime debut)
      await log('[update] step 4: stop containers actuels');
      await this.docker.stop(creds, apiName);
      await this.docker.stop(creds, webName);

      // 5. Run prisma migrate deploy avec une instance temporaire de la nouvelle image
      // Reseau : tenant-<slug>-net (network compose isole du tenant). Les noms de
      // services compose (postgres/redis/minio) ne resolvent QUE sur ce reseau.
      // Avant : optipack-shared (ancienne archi shared) -> EAI_AGAIN redis +
      // Can't reach postgres:5432 car le container n etait pas sur le bon reseau.
      await log('[update] step 5: prisma migrate deploy + db push (container temp)');
      const envFile = `${config.tenantEnvDir}/tenant-${slug}.env`;
      // L'image API a pour ENTRYPOINT `node` : passer `pnpm prisma ...` en CMD
      // donne `node pnpm ...` -> MODULE_NOT_FOUND. On override l'entrypoint sur
      // `sh -c` et on resout le binaire prisma comme au provisioning.
      //
      // L'API n'a PAS de dossier prisma/migrations (schema synchronise via
      // `db push`). `migrate deploy` seul est donc un no-op : sans `db push`,
      // les nouvelles colonnes/tables ne sont jamais appliquees sur la DB du
      // tenant lors d'un update. On lance donc migrate deploy (no-op / futur)
      // PUIS db push (la vraie synchro), idempotent.
      const dbSyncMode = process.env.OPS_TENANT_DB_SYNC ?? 'push';
      const prismaResolve =
        'if command -v prisma >/dev/null 2>&1; then PRISMA=prisma; ' +
        'elif [ -x ./node_modules/.bin/prisma ]; then PRISMA=./node_modules/.bin/prisma; ' +
        'elif command -v npx >/dev/null 2>&1; then PRISMA="npx -y prisma"; ' +
        'elif command -v pnpm >/dev/null 2>&1; then PRISMA="pnpm prisma"; ' +
        'else echo "ERR: prisma CLI introuvable" >&2; exit 1; fi';
      const migrateSteps =
        'NODE_OPTIONS="--max-old-space-size=256" $PRISMA migrate deploy --schema=./prisma/schema.prisma 2>&1 || true; ' +
        (dbSyncMode === 'push'
          ? 'NODE_OPTIONS="--max-old-space-size=256" $PRISMA db push --schema=./prisma/schema.prisma --accept-data-loss=false --skip-generate'
          : 'echo "db push skipped (OPS_TENANT_DB_SYNC=migrate)"');
      const migrateBody = `cd /app/apps/api 2>/dev/null || cd /app; ${prismaResolve}; ${migrateSteps}`;
      const migrateRes = await this.ssh.exec(
        creds,
        `docker run --rm --entrypoint sh --env-file ${envFile} --network ${netName} ${targetRelease.apiImageTag} -c '${migrateBody}'`,
      );
      if (migrateRes.code !== 0) {
        const detail = [migrateRes.stderr, migrateRes.stdout].filter(Boolean).join(' | ').trim();
        await log(`[update] migrate FAILED (code=${migrateRes.code}) : ${detail || '(no output)'}`);
        if (migrateRes.code === 137) {
          throw new Error('Synchro schema OOM-killed (code 137). Retentez l update.');
        }
        throw new Error(`Migration DB echouee : ${detail || '(no output)'}`);
      }

      // 6. Remove old containers + run nouveaux avec memes ports/limites
      await log('[update] step 6: remove old + run new containers');
      const limits = await this.capacity.getTenantLimits(tenant.id);
      const halfCpu = limits.cpuLimit / 2;
      const apiMem = Math.floor(limits.memoryMb * 0.6);
      const webMem = limits.memoryMb - apiMem;

      await this.docker.remove(creds, apiName, true);
      await this.docker.remove(creds, webName, true);

      await this.docker.run(creds, {
        name: apiName,
        image: targetRelease.apiImageTag,
        ports: { [tenant.apiPort!]: 4000 },
        envFile,
        restart: 'unless-stopped',
        network: netName,
        cpuLimit: halfCpu,
        memoryMb: apiMem,
      });
      await this.docker.run(creds, {
        name: webName,
        image: targetRelease.webImageTag,
        ports: { [tenant.webPort!]: 3000 },
        env: {
          TENANT_SLUG: slug,
          NEXT_PUBLIC_API_URL: `https://api.${slug}.${process.env.OPS_BASE_DOMAIN ?? 'transitsoftservices.com'}/api/v1`,
          INTERNAL_API_URL: `http://${apiName}:4000/api/v1`,
        },
        restart: 'unless-stopped',
        network: netName,
        cpuLimit: halfCpu,
        memoryMb: webMem,
      });

      // 7. Health check
      await log('[update] step 7: health check');
      const ok = await this.docker.healthCheck(creds, tenant.apiPort!, '/api/v1/tenant-meta', 90);
      if (!ok) throw new Error('Health check timeout apres update');

      // 8. Update tenant.currentVersion + finir job
      const rollbackBefore = new Date(Date.now() + ROLLBACK_WINDOW_MIN * 60 * 1000);
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { currentVersion: updateJob.toVersion },
      });
      await prisma.tenantUpdateJob.update({
        where: { id: jobId },
        data: {
          status: 'succeeded',
          finishedAt: new Date(),
          rollbackBefore,
        },
      });
      await log(`[update] DONE ${slug} -> ${updateJob.toVersion} (rollback possible jusqu'a ${rollbackBefore.toISOString()})`);
      logger.info({ tenantId: tenant.id, version: updateJob.toVersion }, '[update] tenant updated');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await log(`[update] ROLLBACK : ${msg}`);

      // Rollback : restore DB + ancien container
      try {
        if (backupTaken) {
          await log('[update] rollback : pg_restore depuis backup');
          await this.ssh.exec(
            creds,
            `PGUSER=$(docker exec ${pgName} printenv POSTGRES_USER 2>/dev/null || echo postgres); cat ${backupPath} | docker exec -i ${pgName} pg_restore -U "$PGUSER" -d "${dbName}" --clean --if-exists`,
          );
        }
        if (oldImagesTagged) {
          await log('[update] rollback : redemarrer ancien container');
          await this.docker.remove(creds, apiName, true);
          await this.docker.remove(creds, webName, true);
          const limits = await this.capacity.getTenantLimits(tenant.id);
          const halfCpu = limits.cpuLimit / 2;
          const apiMem = Math.floor(limits.memoryMb * 0.6);
          const webMem = limits.memoryMb - apiMem;
          const envFile = `${config.tenantEnvDir}/tenant-${slug}.env`;
          await this.docker.run(creds, {
            name: apiName,
            image: `ghcr.io/${config.ghcr.namespace}/optipack-api:previous-${slug}`,
            ports: { [tenant.apiPort!]: 4000 },
            envFile,
            restart: 'unless-stopped',
            network: netName,
            cpuLimit: halfCpu,
            memoryMb: apiMem,
          });
          await this.docker.run(creds, {
            name: webName,
            image: `ghcr.io/${config.ghcr.namespace}/optipack-web:previous-${slug}`,
            ports: { [tenant.webPort!]: 3000 },
            env: {
              TENANT_SLUG: slug,
              INTERNAL_API_URL: `http://${apiName}:4000/api/v1`,
            },
            restart: 'unless-stopped',
            network: netName,
            cpuLimit: halfCpu,
            memoryMb: webMem,
          });
        }

        // Job en echec : on retire les nouvelles images tirees a l'etape 2 pour
        // revenir exactement au stade de depart (le tenant tourne de nouveau sur
        // les images :previous-<slug>). Sans --force : si l'image cible est
        // encore utilisee par un autre tenant du VPS, docker la conserve
        // (erreur ignoree) ; on ne supprime que les images orphelines de cette
        // tentative ratee. Les containers temporaires (step 5) sont deja
        // auto-supprimes (`docker run --rm`).
        if (imagesPulled) {
          await log('[update] rollback : suppression des nouvelles images');
          await this.ssh.exec(
            creds,
            `docker rmi ${targetRelease.apiImageTag} ${targetRelease.webImageTag} 2>/dev/null || true`,
          );
        }
      } catch (rbErr) {
        await log(`[update] WARN rollback partiellement echoue : ${rbErr instanceof Error ? rbErr.message : String(rbErr)}`);
      }

      await prisma.tenantUpdateJob.update({
        where: { id: jobId },
        data: { status: 'failed', errorLog: msg, finishedAt: new Date() },
      });
      throw err;
    }
  }
}

/**
 * Rollback dans la fenetre de 30 min apres un update succeede.
 * Restore depuis backup + relance les anciens containers (image :previous-<slug>).
 */
@injectable()
export class RollbackTenantUseCase {
  constructor(
    @inject(SSH_SERVICE) private ssh: SSHService,
    @inject(DOCKER_SERVICE) private docker: DockerService,
    private jobLogger: UpdateJobLogger,
    private capacity: CapacityService,
  ) {}

  async execute(updateJobId: string): Promise<void> {
    const job = await prisma.tenantUpdateJob.findUnique({ where: { id: updateJobId } });
    if (!job) throw new NotFoundError('TenantUpdateJob', updateJobId);
    if (job.status !== 'succeeded') {
      throw new BusinessError(`Rollback impossible : job dans l'etat ${job.status}`);
    }
    if (!job.rollbackBefore || new Date() > job.rollbackBefore) {
      throw new BusinessError('Fenetre de rollback expiree (30 min apres l\'update)');
    }
    if (!job.backupRef) {
      throw new BusinessError('Aucun backup disponible pour ce job');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: job.tenantId },
      include: { vps: true },
    });
    if (!tenant?.vps) throw new BusinessError('Tenant ou VPS introuvable');

    const creds: SshConnection = {
      host: tenant.vps.host,
      port: tenant.vps.port,
      username: tenant.vps.username,
      sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
    };
    const slug = tenant.slug;
    const dbName = tenant.dbName ?? `tenant_${slug.replace(/-/g, '_')}_db`;
    const apiName = `tenant-${slug}-api`;
    const webName = `tenant-${slug}-web`;
    const pgName = `tenant-${slug}-postgres`;
    const netName = `tenant-${slug}-net`;
    const envFile = `${config.tenantEnvDir}/tenant-${slug}.env`;

    const log = (m: string) => this.jobLogger.append(updateJobId, m);
    await log(`[rollback] start ${slug} ${job.toVersion} -> ${job.fromVersion}`);

    // 1. Stop new containers
    await this.docker.stop(creds, apiName);
    await this.docker.stop(creds, webName);

    // 2. Restore DB
    await log('[rollback] pg_restore');
    await this.ssh.exec(
      creds,
      `PGUSER=$(docker exec ${pgName} printenv POSTGRES_USER 2>/dev/null || echo postgres); cat ${job.backupRef} | docker exec -i ${pgName} pg_restore -U "$PGUSER" -d "${dbName}" --clean --if-exists`,
    );

    // 3. Restart anciens containers (image :previous-<slug>)
    await log('[rollback] redemarrer anciens containers');
    await this.docker.remove(creds, apiName, true);
    await this.docker.remove(creds, webName, true);

    const limits = await this.capacity.getTenantLimits(tenant.id);
    const halfCpu = limits.cpuLimit / 2;
    const apiMem = Math.floor(limits.memoryMb * 0.6);
    const webMem = limits.memoryMb - apiMem;

    await this.docker.run(creds, {
      name: apiName,
      image: `ghcr.io/${config.ghcr.namespace}/optipack-api:previous-${slug}`,
      ports: { [tenant.apiPort!]: 4000 },
      envFile,
      restart: 'unless-stopped',
      network: netName,
      cpuLimit: halfCpu,
      memoryMb: apiMem,
    });
    await this.docker.run(creds, {
      name: webName,
      image: `ghcr.io/${config.ghcr.namespace}/optipack-web:previous-${slug}`,
      ports: { [tenant.webPort!]: 3000 },
      env: {
        TENANT_SLUG: slug,
        INTERNAL_API_URL: `http://${apiName}:4000/api/v1`,
      },
      restart: 'unless-stopped',
      network: netName,
      cpuLimit: halfCpu,
      memoryMb: webMem,
    });

    // 4. Update tenant + job status
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { currentVersion: job.fromVersion },
    });
    await prisma.tenantUpdateJob.update({
      where: { id: updateJobId },
      data: { status: 'rolled_back' },
    });
    await log(`[rollback] DONE ${slug} -> ${job.fromVersion}`);
  }
}
