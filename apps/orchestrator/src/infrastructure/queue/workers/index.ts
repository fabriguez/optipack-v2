import { Worker, type Job } from 'bullmq';
import { container } from '../../../container';
import { redisConnection, QUEUE_NAMES } from '../connection';
import type {
  ProvisionJobData,
  LifecycleJobData,
  MigrateJobData,
  UpdateJobData,
  RollbackJobData,
} from '../queues';
import { logger } from '../../logger';
import { ProvisionTenantUseCase } from '../../../application/use-cases/provisioning/ProvisionTenantUseCase';
import {
  FreezeTenantUseCase,
  UnfreezeTenantUseCase,
  DeleteTenantUseCase,
} from '../../../application/use-cases/provisioning/LifecycleUseCases';
import { MigrateTenantUseCase } from '../../../application/use-cases/provisioning/MigrateTenantUseCase';
import {
  UpdateTenantUseCase,
  RollbackTenantUseCase,
} from '../../../application/use-cases/release/UpdateTenantUseCase';
import { ProvisioningJobLogger } from '../../../application/use-cases/provisioning/ProvisioningJobLogger';

const workerOpts = {
  connection: redisConnection,
  concurrency: 1, // 1 a la fois par defaut (un VPS, des conteneurs)
};

interface JobWithLogger {
  provisioningJobId: string;
  tenantId: string;
}

async function withJobLogger<T extends JobWithLogger>(
  bullJob: Job<T>,
  fn: () => Promise<void>,
): Promise<void> {
  const jobId = bullJob.data.provisioningJobId;
  const jobLogger = container.resolve(ProvisioningJobLogger);
  await jobLogger.setStatus(jobId, 'running');
  try {
    await fn();
    await jobLogger.setStatus(jobId, 'succeeded');
  } catch (err: unknown) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    logger.error({ jobId: bullJob.id, err: msg }, '[worker] job failed');
    await jobLogger.append(jobId, `[ERROR] ${msg}`);
    // Si on a epuise les retries, marquer failed. BullMQ retentera selon attempts/backoff.
    if (bullJob.attemptsMade >= (bullJob.opts.attempts ?? 1) - 1) {
      await jobLogger.setStatus(jobId, 'failed');
      // Sync : remettre tenant en erreur visible (PROVISIONING reste mais avec logs erreur)
    }
    throw err;
  }
}

/**
 * Demarre tous les workers de provisioning. Appele au boot de l'app.
 */
export function startProvisioningWorkers(): Worker[] {
  const workers: Worker[] = [];

  // PROVISION
  workers.push(
    new Worker<ProvisionJobData>(
      QUEUE_NAMES.PROVISION,
      async (bullJob) => {
        await withJobLogger(bullJob, async () => {
          const useCase = container.resolve(ProvisionTenantUseCase);
          await useCase.execute(bullJob.data.tenantId, bullJob.data.provisioningJobId);
        });
      },
      workerOpts,
    ),
  );

  // FREEZE
  workers.push(
    new Worker<LifecycleJobData>(
      QUEUE_NAMES.FREEZE,
      async (bullJob) => {
        await withJobLogger(bullJob, async () => {
          await container.resolve(FreezeTenantUseCase).execute(bullJob.data.tenantId, bullJob.data.provisioningJobId);
        });
      },
      workerOpts,
    ),
  );

  // UNFREEZE
  workers.push(
    new Worker<LifecycleJobData>(
      QUEUE_NAMES.UNFREEZE,
      async (bullJob) => {
        await withJobLogger(bullJob, async () => {
          await container.resolve(UnfreezeTenantUseCase).execute(bullJob.data.tenantId, bullJob.data.provisioningJobId);
        });
      },
      workerOpts,
    ),
  );

  // DELETE
  workers.push(
    new Worker<LifecycleJobData>(
      QUEUE_NAMES.DELETE,
      async (bullJob) => {
        await withJobLogger(bullJob, async () => {
          await container.resolve(DeleteTenantUseCase).execute(bullJob.data.tenantId, bullJob.data.provisioningJobId);
        });
      },
      workerOpts,
    ),
  );

  // MIGRATE
  workers.push(
    new Worker<MigrateJobData>(
      QUEUE_NAMES.MIGRATE,
      async (bullJob) => {
        await withJobLogger(bullJob, async () => {
          await container
            .resolve(MigrateTenantUseCase)
            .execute(bullJob.data.tenantId, bullJob.data.provisioningJobId, bullJob.data.targetVpsId);
        });
      },
      workerOpts,
    ),
  );

  // UPDATE (utilise TenantUpdateJob.id, pas un ProvisioningJob ; le useCase gere son
  // propre status workflow scheduled/running/succeeded/failed/rolled_back).
  workers.push(
    new Worker<UpdateJobData>(
      QUEUE_NAMES.UPDATE,
      async (bullJob) => {
        const useCase = container.resolve(UpdateTenantUseCase);
        await useCase.execute(bullJob.data.updateJobId);
      },
      workerOpts,
    ),
  );

  // ROLLBACK
  workers.push(
    new Worker<RollbackJobData>(
      QUEUE_NAMES.ROLLBACK,
      async (bullJob) => {
        const useCase = container.resolve(RollbackTenantUseCase);
        await useCase.execute(bullJob.data.updateJobId);
      },
      workerOpts,
    ),
  );

  for (const w of workers) {
    w.on('completed', (job) =>
      logger.info({ jobId: job.id, queue: w.name }, '[worker] completed'),
    );
    w.on('failed', (job, err) =>
      logger.error(
        { jobId: job?.id, queue: w.name, err: err.message },
        '[worker] failed',
      ),
    );
  }

  logger.info({ count: workers.length }, '[worker] provisioning workers started');
  return workers;
}

export async function stopWorkers(workers: Worker[]): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
}
