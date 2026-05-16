import { Queue, Worker, type Job } from 'bullmq';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as os from 'node:os';
import { redisConnection } from './connection';
import { container } from '../../container';
import { prisma } from '../../config/database';
import { logger } from '../logger';
import { SSHService, SSH_SERVICE } from '../ssh/SSHService';

const execAsync = promisify(exec);
import { DockerService, DOCKER_SERVICE } from '../docker/DockerService';
import { BillingUseCases } from '../../application/use-cases/billing/BillingUseCases';
import { GHCRClient } from '../ghcr/GHCRClient';
import { ReleaseUseCases } from '../../application/use-cases/release/ReleaseUseCases';
import { BackupTenantUseCase } from '../../application/use-cases/backup/BackupTenantUseCase';
import { NotificationService } from '../notifications/NotificationService';
import { DiskQuotaCheckUseCase } from '../../application/use-cases/monitoring/DiskQuotaCheckUseCase';

const MONITOR_QUEUE = 'monitoring';
const MONITOR_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const AUTOFREEZE_INTERVAL_MS = 60 * 60 * 1000; // 1h
const RELEASE_SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1h - poll GHCR pour nouvelles versions
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h - backups nightly

/**
 * VPS local (meme machine que l'orchestrator) : pas de SSH a faire. Le nom est
 * configurable via OPS_SELF_VPS_NAME (defaut "self"). Le seed du tenant
 * principal cree un enregistrement VPS avec ce nom et un sshKeyEncrypted
 * placeholder qui ne pourra pas etre dechiffre -- donc on doit explicitement
 * skip ce VPS dans les cron de monitoring SSH.
 */
const SELF_VPS_NAME = process.env.OPS_SELF_VPS_NAME ?? 'self';

/**
 * Identifie un VPS "self" : nom configure OU host loopback. Le double check
 * couvre les seeds qui renomment self en "self-prod" tout en gardant 127.0.0.1.
 */
function isSelfVps(vps: { name: string; host: string }): boolean {
  return vps.name === SELF_VPS_NAME || vps.host === '127.0.0.1' || vps.host === 'localhost';
}

/**
 * Metriques locales (CPU/RAM/disque) sans SSH. Utilise pour le VPS self : on
 * affiche les memes infos que les VPS distants au lieu d'avoir des cellules
 * vides dans la liste ops-admin.
 *
 *  - CPU  : moyenne sur 1 seconde (delta de os.cpus() times entre deux mesures)
 *  - RAM  : (total - free) / total via os.totalmem()/os.freemem()
 *  - Disk : `df -P /` (POSIX, sortie stable) parsing colonne "Use%"
 */
async function collectLocalUsage(): Promise<{ cpuUsagePct: number; ramUsagePct: number; diskUsagePct: number }> {
  // CPU : echantillon delta sur 1s
  const t1 = os.cpus().map((c) => c.times);
  await new Promise((r) => setTimeout(r, 1000));
  const t2 = os.cpus().map((c) => c.times);
  let totalDelta = 0;
  let idleDelta = 0;
  for (let i = 0; i < t1.length; i++) {
    const a = t1[i];
    const b = t2[i];
    if (!a || !b) continue;
    const aTotal = a.user + a.nice + a.sys + a.idle + a.irq;
    const bTotal = b.user + b.nice + b.sys + b.idle + b.irq;
    totalDelta += bTotal - aTotal;
    idleDelta += b.idle - a.idle;
  }
  const cpuUsagePct = totalDelta > 0 ? Math.round(((totalDelta - idleDelta) / totalDelta) * 100) : 0;

  const total = os.totalmem();
  const free = os.freemem();
  const ramUsagePct = total > 0 ? Math.round(((total - free) / total) * 100) : 0;

  let diskUsagePct = 0;
  try {
    const { stdout } = await execAsync("df -P / | tail -1 | awk '{print $5}'");
    diskUsagePct = parseInt(stdout.trim().replace('%', ''), 10) || 0;
  } catch {
    // df indisponible (Windows, containers minimalistes) : on laisse 0.
  }

  return { cpuUsagePct, ramUsagePct, diskUsagePct };
}

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
    // VPS local : pas de SSH, on collecte les metriques directement via
    // node:os + df. Sans ca, l'UI ops-admin affichait des cellules vides
    // pour le self alors que les autres VPS montraient des pourcentages.
    if (isSelfVps(vps)) {
      try {
        const usage = await collectLocalUsage();
        await prisma.vPS.update({
          where: { id: vps.id },
          data: {
            cpuUsagePct: usage.cpuUsagePct,
            ramUsagePct: usage.ramUsagePct,
            diskUsagePct: usage.diskUsagePct,
            lastSeenAt: new Date(),
          },
        });
        logger.debug({ vpsId: vps.id, host: vps.host, ...usage }, '[monitor] self vps ok');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn({ vpsId: vps.id, err: msg }, '[monitor] self vps local metrics failed');
        await prisma.vPS.update({
          where: { id: vps.id },
          data: { lastSeenAt: new Date() },
        });
      }
      continue;
    }
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
    // Tenant principal (isMain) ou VPS local : pas de SSH a faire. Son
    // healthcheck devrait passer par un canal local (a faire dans un second
    // temps), pour l'instant on skip pour eviter de polluer les logs.
    if ((t as { isMain?: boolean }).isMain || isSelfVps(t.vps)) {
      continue;
    }
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

/**
 * Liste des images dont on poll les tags pour detecter les nouvelles releases.
 * Une release est creee des qu'un tag semver apparait sur AU MOINS UNE de ces
 * images. La CI tague typiquement les 4 ensemble avec la meme version, mais
 * si l'une echoue, la release apparait quand meme (l'admin peut decider de
 * la publier ou pas).
 */
// ops-admin n'est pas un livrable tenant : c'est le control plane SaaS,
// deploye separement et invisible aux clients. On ne le track pas ici.
const TRACKED_IMAGES = [
  'optipack-api',
  'optipack-web',
  'optipack-web-client',
] as const;

export async function runReleaseSync(): Promise<{
  configured: boolean;
  imagesPolled: number;
  tagsFound: number;
  semverTags: number;
  created: number;
  perImage: { image: string; tagsFound: number; semverTags: number; error?: string }[];
  errors: { version: string; message: string }[];
}> {
  const ghcr = container.resolve(GHCRClient);
  const releases = container.resolve(ReleaseUseCases);
  if (!ghcr.isConfigured()) {
    logger.debug('[release-sync] GHCR non configure, skip');
    return {
      configured: false,
      imagesPolled: 0,
      tagsFound: 0,
      semverTags: 0,
      created: 0,
      perImage: [],
      errors: [],
    };
  }

  // Poll chaque image en parallele, union des tags semver.
  const perImage: {
    image: string;
    tagsFound: number;
    semverTags: number;
    error?: string;
  }[] = [];
  const unionSemver = new Set<string>();
  let totalRawTags = 0;

  await Promise.all(
    TRACKED_IMAGES.map(async (image) => {
      try {
        const raw = await ghcr.listTags(image);
        const semver = ghcr.filterSemverTags(raw);
        for (const v of semver) unionSemver.add(v);
        totalRawTags += raw.length;
        perImage.push({ image, tagsFound: raw.length, semverTags: semver.length });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        perImage.push({ image, tagsFound: 0, semverTags: 0, error: msg });
        logger.warn({ image, err: msg }, '[release-sync] image poll failed');
      }
    }),
  );

  let created = 0;
  const errors: { version: string; message: string }[] = [];
  for (const version of unionSemver) {
    const exists = await prisma.release.findUnique({ where: { version } });
    if (exists) continue;
    try {
      await releases.create({ version, isStable: false, isCritical: false });
      created++;
      logger.info({ version }, '[release-sync] new release detected (unpublished)');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ version, message: msg });
      logger.warn({ version, err: msg }, '[release-sync] create failed');
    }
  }

  logger.info(
    { images: TRACKED_IMAGES.length, tagsFound: totalRawTags, semverTags: unionSemver.size, created },
    '[release-sync] sync complete',
  );

  return {
    configured: true,
    imagesPolled: TRACKED_IMAGES.length,
    tagsFound: totalRawTags,
    semverTags: unionSemver.size,
    created,
    perImage,
    errors,
  };
}

async function runBackupNightly() {
  const backups = container.resolve(BackupTenantUseCase);
  const result = await backups.runNightly();
  if (result.failed > 0) {
    logger.warn(result, '[backup-nightly] some failures');
  }
  // Couple : verification quota disque (cf. #11/#18). Meme rythme quotidien.
  const disk = await container.resolve(DiskQuotaCheckUseCase).run();
  if (disk.warnings > 0 || disk.criticals > 0) {
    logger.warn(disk, '[disk-quota] tenants approchent / depassent quota');
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
