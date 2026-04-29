import { Queue, Worker, type Job } from 'bullmq';
import { redisConnection } from './connection';
import { container } from '../../container';
import { prisma } from '../../config/database';
import { logger } from '../logger';
import { SSHService, SSH_SERVICE } from '../ssh/SSHService';
import { DockerService, DOCKER_SERVICE } from '../docker/DockerService';
import { BillingUseCases } from '../../application/use-cases/billing/BillingUseCases';
import { GHCRClient } from '../ghcr/GHCRClient';
import { ReleaseUseCases } from '../../application/use-cases/release/ReleaseUseCases';
import { BackupTenantUseCase } from '../../application/use-cases/backup/BackupTenantUseCase';
import { NotificationService } from '../notifications/NotificationService';

const MONITOR_QUEUE = 'monitoring';
const MONITOR_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const AUTOFREEZE_INTERVAL_MS = 60 * 60 * 1000; // 1h
const RELEASE_SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1h - poll GHCR pour nouvelles versions
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h - backups nightly

export const monitoringQueue = new Queue(MONITOR_QUEUE, { connection: redisConnection });

interface VpsMonitorPayload {
  type: 'VPS_HEARTBEAT';
}

interface TenantHealthPayload {
  type: 'TENANT_HEALTH';
}

interface AutoFreezePayload {
  type: 'AUTO_FREEZE';
}

interface ReleaseSyncPayload {
  type: 'RELEASE_SYNC';
}

interface BackupNightlyPayload {
  type: 'BACKUP_NIGHTLY';
}

type MonitorPayload =
  | VpsMonitorPayload
  | TenantHealthPayload
  | AutoFreezePayload
  | ReleaseSyncPayload
  | BackupNightlyPayload;

/**
 * Cron toutes les 5 minutes :
 *  - VPS_HEARTBEAT : ssh chaque VPS, recupere CPU/RAM/disque, met a jour la DB
 *  - TENANT_HEALTH : verifie chaque tenant ACTIVE en pingant son API local
 *
 * Si un VPS ne repond plus pendant 3 cycles consecutifs (15 min) -> log critical.
 * Phase 5 : envoi d'email/notification a l'ops admin.
 */

async function runVpsHeartbeat() {
  const ssh = container.resolve<SSHService>(SSH_SERVICE);
  const allVps = await prisma.vPS.findMany({ where: { status: 'ACTIVE' } });

  for (const vps of allVps) {
    try {
      const usage = await ssh.getUsage({
        host: vps.host,
        port: vps.port,
        username: vps.username,
        sshKeyEncrypted: vps.sshKeyEncrypted,
      });
      await prisma.vPS.update({
        where: { id: vps.id },
        data: {
          cpuUsagePct: usage.cpuUsagePct,
          ramUsagePct: usage.ramUsagePct,
          diskUsagePct: usage.diskUsagePct,
          lastSeenAt: new Date(),
        },
      });
      logger.debug({ vpsId: vps.id, host: vps.host, ...usage }, '[monitor] vps ok');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn({ vpsId: vps.id, host: vps.host, err: msg }, '[monitor] vps unreachable');
      // On ne update pas lastSeenAt -> visible dans l'UI ops-admin (alert)
      const stale = vps.lastSeenAt && Date.now() - vps.lastSeenAt.getTime() > 15 * 60 * 1000;
      if (stale) {
        logger.error({ vpsId: vps.id, host: vps.host }, '[monitor] vps offline > 15min');
        await container.resolve(NotificationService).vpsDown(vps.host, vps.lastSeenAt);
      }
    }
  }
}

async function runTenantHealthCheck() {
  const docker = container.resolve<DockerService>(DOCKER_SERVICE);
  const tenants = await prisma.tenant.findMany({
    where: { status: 'ACTIVE' },
    include: { vps: true },
  });

  for (const t of tenants) {
    if (!t.apiPort || !t.vps) continue;
    try {
      const ok = await docker.healthCheck(
        {
          host: t.vps.host,
          port: t.vps.port,
          username: t.vps.username,
          sshKeyEncrypted: t.vps.sshKeyEncrypted,
        },
        t.apiPort,
        '/api/v1/tenant-meta',
        15, // timeout court pour ne pas bloquer le cron
      );
      if (!ok) {
        logger.warn({ tenantId: t.id, slug: t.slug }, '[monitor] tenant API unhealthy');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn({ tenantId: t.id, slug: t.slug, err: msg }, '[monitor] tenant check failed');
    }
  }
}

async function runAutoFreeze() {
  const billing = container.resolve(BillingUseCases);
  const result = await billing.runAutoFreezeCron();
  if (result.frozen > 0) {
    logger.warn({ frozen: result.frozen }, '[monitor] auto-freeze tenants expired');
  }
  // Preavis 7j + cleanup long-frozen sont du meme rythme quotidien
  const notice = await billing.runExpiringNoticeCron();
  if (notice.notified > 0) {
    logger.info({ notified: notice.notified }, '[monitor] preavis expiration');
  }
  const released = await billing.runReleaseLongFrozenCron();
  if (released.archived > 0) {
    logger.warn({ archived: released.archived }, '[monitor] long-frozen tenants archives');
  }
}

async function runReleaseSync() {
  const ghcr = container.resolve(GHCRClient);
  const releases = container.resolve(ReleaseUseCases);
  if (!ghcr.isConfigured()) {
    logger.debug('[release-sync] GHCR non configure, skip');
    return;
  }

  // On poll les tags de l'image API. La version d'un release = tag commun api+web.
  const tags = ghcr.filterSemverTags(await ghcr.listTags('optipack-api'));
  let created = 0;
  for (const version of tags) {
    const exists = await prisma.release.findUnique({ where: { version } });
    if (exists) continue;
    try {
      await releases.create({ version, isStable: false, isCritical: false });
      created++;
      logger.info({ version }, '[release-sync] new release detected (unpublished)');
    } catch (e: unknown) {
      logger.warn(
        { version, err: e instanceof Error ? e.message : String(e) },
        '[release-sync] create failed',
      );
    }
  }
  if (created > 0) {
    logger.info({ created }, '[release-sync] sync complete');
  }
}

async function runBackupNightly() {
  const backups = container.resolve(BackupTenantUseCase);
  const result = await backups.runNightly();
  if (result.failed > 0) {
    logger.warn(result, '[backup-nightly] some failures');
  }
}

export async function scheduleMonitoringJobs(): Promise<void> {
  // BullMQ repeatable jobs : se replanifient automatiquement toutes les N ms
  await monitoringQueue.add(
    'vps-heartbeat',
    { type: 'VPS_HEARTBEAT' } satisfies VpsMonitorPayload,
    {
      repeat: { every: MONITOR_INTERVAL_MS },
      jobId: 'recurring-vps-heartbeat',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  await monitoringQueue.add(
    'tenant-health',
    { type: 'TENANT_HEALTH' } satisfies TenantHealthPayload,
    {
      repeat: { every: MONITOR_INTERVAL_MS },
      jobId: 'recurring-tenant-health',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  await monitoringQueue.add(
    'auto-freeze',
    { type: 'AUTO_FREEZE' } satisfies AutoFreezePayload,
    {
      repeat: { every: AUTOFREEZE_INTERVAL_MS },
      jobId: 'recurring-auto-freeze',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  await monitoringQueue.add(
    'release-sync',
    { type: 'RELEASE_SYNC' } satisfies ReleaseSyncPayload,
    {
      repeat: { every: RELEASE_SYNC_INTERVAL_MS },
      jobId: 'recurring-release-sync',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  await monitoringQueue.add(
    'backup-nightly',
    { type: 'BACKUP_NIGHTLY' } satisfies BackupNightlyPayload,
    {
      repeat: { every: BACKUP_INTERVAL_MS },
      jobId: 'recurring-backup-nightly',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  logger.info(
    {
      monitorMs: MONITOR_INTERVAL_MS,
      autoFreezeMs: AUTOFREEZE_INTERVAL_MS,
      releaseSyncMs: RELEASE_SYNC_INTERVAL_MS,
      backupMs: BACKUP_INTERVAL_MS,
    },
    '[monitor] cron jobs scheduled',
  );
}

export function startMonitoringWorker(): Worker {
  const worker = new Worker<MonitorPayload>(
    MONITOR_QUEUE,
    async (job: Job<MonitorPayload>) => {
      if (job.data.type === 'VPS_HEARTBEAT') {
        await runVpsHeartbeat();
      } else if (job.data.type === 'TENANT_HEALTH') {
        await runTenantHealthCheck();
      } else if (job.data.type === 'AUTO_FREEZE') {
        await runAutoFreeze();
      } else if (job.data.type === 'RELEASE_SYNC') {
        await runReleaseSync();
      } else if (job.data.type === 'BACKUP_NIGHTLY') {
        await runBackupNightly();
      }
    },
    {
      connection: redisConnection,
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) =>
    logger.error({ jobId: job?.id, err: err.message }, '[monitor-worker] failed'),
  );

  return worker;
}

export async function closeMonitoring(worker: Worker | null): Promise<void> {
  if (worker) await worker.close();
  await monitoringQueue.close();
}
