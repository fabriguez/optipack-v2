import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { logger } from '../../../infrastructure/logger';

/**
 * Accumule les logs textuels d'un job d'update (TenantUpdateJob) dans le record
 * DB. Visible cote ops-admin via `GET /tenants/:id/update-jobs/:jobId` (polling
 * pendant l'update). Equivalent de ProvisioningJobLogger mais cible la table
 * tenant_update_jobs (l'update job a son propre id, distinct des provisioning).
 */
@injectable()
export class UpdateJobLogger {
  async append(jobId: string, line: string): Promise<void> {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    logger.info({ updateJobId: jobId }, line);
    try {
      const job = await prisma.tenantUpdateJob.findUnique({
        where: { id: jobId },
        select: { logs: true },
      });
      const next = job?.logs ? `${job.logs}\n${stamped}` : stamped;
      await prisma.tenantUpdateJob.update({ where: { id: jobId }, data: { logs: next } });
    } catch {
      // ne pas planter le worker si le log fail
    }
  }
}
