import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { logger } from '../../../infrastructure/logger';

/**
 * Accumule les logs textuels d'un job de provisioning dans le record DB.
 * Visible cote ops-admin via `GET /tenants/:id/jobs`.
 */
@injectable()
export class ProvisioningJobLogger {
  async append(jobId: string, line: string): Promise<void> {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    logger.info({ jobId }, line);
    try {
      // Append textuel : on lit puis on update (acceptable pour ces volumes ; en cas de
      // contention on peut passer a un tableau JSON ou stream Redis).
      const job = await prisma.provisioningJob.findUnique({ where: { id: jobId }, select: { logs: true } });
      const next = job?.logs ? `${job.logs}\n${stamped}` : stamped;
      await prisma.provisioningJob.update({ where: { id: jobId }, data: { logs: next } });
    } catch {
      // ne pas planter le worker si le log fail
    }
  }

  async setStatus(
    jobId: string,
    status: 'running' | 'succeeded' | 'failed',
    extra?: { errorLog?: string },
  ): Promise<void> {
    await prisma.provisioningJob.update({
      where: { id: jobId },
      data: {
        status,
        ...(status === 'running' && { startedAt: new Date() }),
        ...(status !== 'running' && { finishedAt: new Date() }),
        ...(extra?.errorLog && { logs: { set: extra.errorLog } as never }),
      },
    });
  }
}
