import { Queue } from 'bullmq';
import { redisConnection, QUEUE_NAMES } from './connection';

export interface ProvisionJobData {
  tenantId: string;
  provisioningJobId: string;
}

export interface LifecycleJobData {
  tenantId: string;
  provisioningJobId: string;
}

export interface MigrateJobData {
  tenantId: string;
  provisioningJobId: string;
  targetVpsId: string;
}

const defaults = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
    removeOnFail: { age: 30 * 24 * 3600, count: 1000 },
  },
};

export interface UpdateJobData {
  /** TenantUpdateJob.id (queue separee des ProvisioningJob) */
  updateJobId: string;
}

export interface RollbackJobData {
  updateJobId: string;
}

export interface SiteDeployJobData {
  tenantId: string;
  trigger: 'manual' | 'webhook';
}

/**
 * Options du site-deploy : on RETIRE le job de bull des qu'il finit
 * (removeOnComplete/Fail = true). Combine a un jobId deterministe
 * `site-deploy-<tenantId>`, ca DEDUPE les deploys concurrents d'un meme
 * tenant : tant qu'un build est en file/en cours, les pushes suivants sont
 * coalesces. L'historique + les logs vivent dans SiteDeployJob (DB), pas dans
 * bull. Un seul essai (pas de retry auto) : un build qui echoue se relance via
 * le bouton "Redeploy" ou un nouveau push.
 */
const siteDeployDefaults = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
  },
};

// 3e generique (NameType) = string : BullMQ >= 5.70 typage strict du nom de job.
// Sans ca, queue.add('provision', ...) refuse les strings litterales.
export const provisionQueue = new Queue<ProvisionJobData, unknown, string>(QUEUE_NAMES.PROVISION, defaults);
export const freezeQueue = new Queue<LifecycleJobData, unknown, string>(QUEUE_NAMES.FREEZE, defaults);
export const unfreezeQueue = new Queue<LifecycleJobData, unknown, string>(QUEUE_NAMES.UNFREEZE, defaults);
export const deleteQueue = new Queue<LifecycleJobData, unknown, string>(QUEUE_NAMES.DELETE, defaults);
export const purgeQueue = new Queue<LifecycleJobData, unknown, string>(QUEUE_NAMES.PURGE, defaults);
export const migrateQueue = new Queue<MigrateJobData, unknown, string>(QUEUE_NAMES.MIGRATE, defaults);
export const updateQueue = new Queue<UpdateJobData, unknown, string>(QUEUE_NAMES.UPDATE, defaults);
export const rollbackQueue = new Queue<RollbackJobData, unknown, string>(QUEUE_NAMES.ROLLBACK, defaults);
export const siteDeployQueue = new Queue<SiteDeployJobData, unknown, string>(
  QUEUE_NAMES.SITE_DEPLOY,
  siteDeployDefaults,
);

export async function closeQueues(): Promise<void> {
  await Promise.all([
    provisionQueue.close(),
    freezeQueue.close(),
    unfreezeQueue.close(),
    deleteQueue.close(),
    purgeQueue.close(),
    migrateQueue.close(),
    updateQueue.close(),
    rollbackQueue.close(),
    siteDeployQueue.close(),
  ]);
}
