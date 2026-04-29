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

export const provisionQueue = new Queue<ProvisionJobData>(QUEUE_NAMES.PROVISION, defaults);
export const freezeQueue = new Queue<LifecycleJobData>(QUEUE_NAMES.FREEZE, defaults);
export const unfreezeQueue = new Queue<LifecycleJobData>(QUEUE_NAMES.UNFREEZE, defaults);
export const deleteQueue = new Queue<LifecycleJobData>(QUEUE_NAMES.DELETE, defaults);
export const migrateQueue = new Queue<MigrateJobData>(QUEUE_NAMES.MIGRATE, defaults);
export const updateQueue = new Queue<UpdateJobData>(QUEUE_NAMES.UPDATE, defaults);
export const rollbackQueue = new Queue<RollbackJobData>(QUEUE_NAMES.ROLLBACK, defaults);

export async function closeQueues(): Promise<void> {
  await Promise.all([
    provisionQueue.close(),
    freezeQueue.close(),
    unfreezeQueue.close(),
    deleteQueue.close(),
    migrateQueue.close(),
    updateQueue.close(),
    rollbackQueue.close(),
  ]);
}
