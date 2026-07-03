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
 * Le tenant tourne comme une stack docker compose (postgres/redis/minio/api/
 * web/web-client) decrite dans `${tenantEnvDir}/tenant-<slug>-compose.yml`. Le
 * service `web` tire son `AUTH_SECRET` (NextAuth) du `env_file` du tenant : on
 * NE recree donc JAMAIS les containers via `docker run` (cela perdait le
 * env_file -> NextAuth `MissingSecret` -> /api/auth/session 500). On met a jour
 * en patchant les tags d'image dans le compose puis `docker compose up -d`.
 *
 * Sequence :
 *  1. Backup DB (pg_dump)
 *  2. docker pull nouvelles images (api + web + web-client)
 *  3. Backup du fichier compose (rollback exact)
 *  4. Patch des tags d'image dans le compose -> nouvelle version
 *  5. prisma migrate deploy + db push (container temp, nouvelle image API)
 *  6. docker compose up -d (recree api/web/web-client avec env_file conserve)
 *  7. Health check (90s)
 *  8. OK  : currentVersion = toVersion, job succeeded, rollbackBefore = now+30min
 *  9. KO  : restore DB + restore compose + compose up + suppression des nouvelles images
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
    const ns = config.ghcr.namespace;
    const dbName = tenant.dbName ?? `tenant_${slug.replace(/-/g, '_')}_db`;
    const pgName = `tenant-${slug}-postgres`;
    const netName = `tenant-${slug}-net`;
    const composeFile = `${config.tenantEnvDir}/tenant-${slug}-compose.yml`;
    const composeProject = `tenant-${slug}`;
    const fromVersion = tenant.currentVersion ?? 'unknown';
    const stamp = Date.now();
    const backupPath = `/tmp/tenant-${slug}-pre-${fromVersion}-${stamp}.sql`;
    const composeBackup = `${composeFile}.pre-${fromVersion}-${stamp}.bak`;

    await prisma.tenantUpdateJob.update({
      where: { id: jobId },
      data: { status: 'running', startedAt: new Date() },
    });
    await log(`[update] start ${slug} ${fromVersion} -> ${updateJob.toVersion}`);

    let backupTaken = false;
    let composeBackedUp = false;
    let imagesPulled = false;
    let resolvedWebClientTag: string | undefined;
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

      // 2. Pull nouvelles images (api + web + web-client)
      await log(`[update] step 2: docker pull ${targetRelease.apiImageTag}`);
      if (config.ghcr.pullToken) {
        await this.docker.loginGhcr(creds, config.ghcr.namespace, config.ghcr.pullToken);
      }
      await this.docker.pull(creds, targetRelease.apiImageTag);
      await this.docker.pull(creds, targetRelease.webImageTag);
      // web-client : tag explicite de la release, sinon derive de la version (la
      // CI publie les 3 images par version). Best-effort : si l'image n'existe
      // pas (anciennes releases sans web-client), web-client n'est pas mis a jour
      // mais l'update n'echoue pas.
      const webClientCandidate =
        targetRelease.webClientImageTag ?? `ghcr.io/${ns}/optipack-web-client:${targetRelease.version}`;
      try {
        await this.docker.pull(creds, webClientCandidate);
        resolvedWebClientTag = webClientCandidate;
      } catch (e) {
        await log(
          `[update] WARN web-client non mis a jour (image ${webClientCandidate} indisponible) : ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      imagesPulled = true;

      // 3. Backup du fichier compose (pour un rollback exact au stade de depart)
      await log('[update] step 3: backup du fichier compose');
      const cp = await this.ssh.exec(creds, `cp ${composeFile} ${composeBackup}`);
      if (cp.code !== 0) throw new Error(`backup compose echoue : ${cp.stderr || cp.stdout}`);
      composeBackedUp = true;

      // 4. Patch des tags d'image dans le compose -> nouvelle version
      await log('[update] step 4: patch des images dans le compose');
      await this.docker.patchComposeImages(creds, composeFile, ns, {
        api: targetRelease.apiImageTag,
        web: targetRelease.webImageTag,
        webClient: resolvedWebClientTag,
      });

      // 5. prisma migrate deploy + db push (container temp, nouvelle image API).
      // ENTRYPOINT de l'image = `node` : passer `pnpm prisma ...` en CMD donne
      // `node pnpm ...` -> MODULE_NOT_FOUND. On override l'entrypoint sur `sh -c`
      // et on resout le binaire prisma comme au provisioning. L'API n'a PAS de
      // dossier prisma/migrations (schema synchronise via db push) : migrate
      // deploy seul est un no-op, donc on enchaine db push (idempotent) qui
      // applique reellement les nouvelles colonnes/tables.
      // 4bis. Self-heal du .env tenant : l'API >= beta-1.0.291 refuse de
      // demarrer en production si JWT_REFRESH_SECRET est absent, placeholder
      // ou egal a JWT_SECRET (fail-fast securite). Les tenants provisionnes
      // avant cette version n'ont pas cette variable -> crash-loop au step 6
      // puis rollback systematique. On injecte une valeur forte si besoin.
      // Effet de bord accepte : les refresh tokens emis avec l'ancien secret
      // par defaut deviennent invalides (re-login a l'expiration de l'access
      // token), les sessions actives ne cassent pas immediatement.
      await log('[update] step 4bis: verification JWT_REFRESH_SECRET dans le .env tenant');
      const envFile = `${config.tenantEnvDir}/tenant-${slug}.env`;
      const healSecret =
        `JS=$(grep -m1 '^JWT_SECRET=' ${envFile} | cut -d= -f2-); ` +
        `JRS=$(grep -m1 '^JWT_REFRESH_SECRET=' ${envFile} | cut -d= -f2-); ` +
        `if [ -z "$JRS" ] || [ "$JRS" = "$JS" ] || [ "$JRS" = "change-me-refresh" ]; then ` +
        `sed -i '/^JWT_REFRESH_SECRET=/d' ${envFile}; ` +
        `echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)" >> ${envFile}; ` +
        `echo healed; fi`;
      const heal = await this.ssh.exec(creds, healSecret);
      if (heal.code !== 0) {
        throw new Error(`Verification JWT_REFRESH_SECRET echouee : ${heal.stderr || heal.stdout}`);
      }
      if (heal.stdout.includes('healed')) {
        await log('[update] step 4bis: JWT_REFRESH_SECRET genere et ajoute au .env');
      }

      await log('[update] step 5: prisma migrate deploy + db push (container temp)');
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

      // 6. docker compose up -d : recree api/web/web-client avec leurs nouvelles
      // images, en conservant env_file (donc AUTH_SECRET), environment et reseau.
      await log('[update] step 6: docker compose up -d (nouvelle version)');
      await this.docker.recreateTenantApp(creds, slug, composeFile, composeProject);

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

      // Rollback : retour exact au stade de depart.
      try {
        // a. Restore DB
        if (backupTaken) {
          await log('[update] rollback : pg_restore depuis backup');
          await this.ssh.exec(
            creds,
            `PGUSER=$(docker exec ${pgName} printenv POSTGRES_USER 2>/dev/null || echo postgres); cat ${backupPath} | docker exec -i ${pgName} pg_restore -U "$PGUSER" -d "${dbName}" --clean --if-exists`,
          );
        }
        // b. Restore le compose d'origine (anciens tags) + relance via compose
        // (conserve env_file -> AUTH_SECRET present, pas de MissingSecret).
        if (composeBackedUp) {
          await log('[update] rollback : restauration du compose + compose up');
          await this.ssh.exec(creds, `cp -f ${composeBackup} ${composeFile}`);
          await this.docker.recreateTenantApp(creds, slug, composeFile, composeProject);
          const back = await this.docker.healthCheck(creds, tenant.apiPort!, '/api/v1/tenant-meta', 60);
          if (!back) {
            await log('[update] WARN rollback : health check KO apres restauration (intervention manuelle requise)');
          }
        }
        // c. Job en echec : retirer les nouvelles images tirees (retour stade de
        // depart). Sans --force : une image encore utilisee par un autre tenant
        // du VPS est conservee (erreur ignoree). Le container temp du step 5 est
        // deja auto-supprime (`docker run --rm`).
        if (imagesPulled) {
          await log('[update] rollback : suppression des nouvelles images');
          const newImages = [targetRelease.apiImageTag, targetRelease.webImageTag, resolvedWebClientTag]
            .filter(Boolean)
            .join(' ');
          await this.ssh.exec(creds, `docker rmi ${newImages} 2>/dev/null || true`);
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
 * Rollback manuel dans la fenetre de 30 min apres un update succeede.
 * Restore la DB depuis backup + repointe le compose sur les images de la
 * version d'origine puis `docker compose up -d` (env_file conserve).
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
    const ns = config.ghcr.namespace;
    const dbName = tenant.dbName ?? `tenant_${slug.replace(/-/g, '_')}_db`;
    const pgName = `tenant-${slug}-postgres`;
    const composeFile = `${config.tenantEnvDir}/tenant-${slug}-compose.yml`;
    const composeProject = `tenant-${slug}`;

    const log = (m: string) => this.jobLogger.append(updateJobId, m);
    await log(`[rollback] start ${slug} ${job.toVersion} -> ${job.fromVersion}`);

    // 1. Restore DB
    await log('[rollback] pg_restore');
    await this.ssh.exec(
      creds,
      `PGUSER=$(docker exec ${pgName} printenv POSTGRES_USER 2>/dev/null || echo postgres); cat ${job.backupRef} | docker exec -i ${pgName} pg_restore -U "$PGUSER" -d "${dbName}" --clean --if-exists`,
    );

    // 2. Repointer le compose sur les images de la version d'origine. On prend
    // les tags exacts de la release fromVersion si elle existe, sinon on les
    // reconstruit `:<fromVersion>`.
    const fromRelease = await prisma.release.findUnique({ where: { version: job.fromVersion } });
    const apiTag = fromRelease?.apiImageTag ?? `ghcr.io/${ns}/optipack-api:${job.fromVersion}`;
    const webTag = fromRelease?.webImageTag ?? `ghcr.io/${ns}/optipack-web:${job.fromVersion}`;
    const webClientTag = fromRelease?.webClientImageTag ?? `ghcr.io/${ns}/optipack-web-client:${job.fromVersion}`;

    await log('[rollback] patch compose -> images version d origine + compose up');
    await this.docker.patchComposeImages(creds, composeFile, ns, {
      api: apiTag,
      web: webTag,
      webClient: webClientTag,
    });
    await this.docker.recreateTenantApp(creds, slug, composeFile, composeProject);

    // 3. Health check (best-effort : on log si KO)
    const ok = await this.docker.healthCheck(creds, tenant.apiPort!, '/api/v1/tenant-meta', 60);
    if (!ok) await log('[rollback] WARN health check KO apres rollback');

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
