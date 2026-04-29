import { injectable } from 'tsyringe';
import { z } from 'zod';
import { prisma } from '../../../config/database';
import { updateQueue, rollbackQueue } from '../../../infrastructure/queue/queues';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

export const requestUpdateSchema = z.object({
  toVersion: z.string(),
  /** Si fourni, le job est scheduled pour cette date. Sinon, immediat. */
  scheduledFor: z.string().datetime().optional(),
  triggeredBy: z.enum(['tenant_owner', 'ops_admin', 'auto_critical']).default('ops_admin'),
});

export type RequestUpdateInput = z.infer<typeof requestUpdateSchema>;

@injectable()
export class RequestUpdateUseCase {
  /**
   * Cree un TenantUpdateJob (status=scheduled) et l'enqueue.
   * Si `scheduledFor` est dans le futur, BullMQ delaiera l'execution avec `delay`.
   */
  async request(tenantId: string, input: RequestUpdateInput) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    if (tenant.status !== 'ACTIVE') {
      throw new BusinessError(`Tenant doit etre ACTIVE pour update (current: ${tenant.status})`);
    }
    if (tenant.pinnedVersion && input.triggeredBy !== 'auto_critical' && input.triggeredBy !== 'ops_admin') {
      throw new BusinessError(`Tenant pinned sur ${tenant.pinnedVersion}. Demandez a l'ops admin de depinner d'abord.`);
    }

    const release = await prisma.release.findUnique({ where: { version: input.toVersion } });
    if (!release) throw new NotFoundError('Release', input.toVersion);
    if (!release.isPublished && input.triggeredBy === 'tenant_owner') {
      throw new BusinessError('Cette version n\'est pas encore publiee.');
    }

    // Pas de update concurrent
    const inflight = await prisma.tenantUpdateJob.findFirst({
      where: { tenantId, status: { in: ['scheduled', 'running'] } },
    });
    if (inflight) {
      throw new BusinessError('Un update est deja en cours ou planifie pour ce tenant.');
    }

    const fromVersion = tenant.currentVersion ?? 'unknown';
    const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
    const delay = scheduledFor ? Math.max(0, scheduledFor.getTime() - Date.now()) : 0;

    const job = await prisma.tenantUpdateJob.create({
      data: {
        tenantId,
        fromVersion,
        toVersion: input.toVersion,
        status: 'scheduled',
        scheduledFor,
        triggeredBy: input.triggeredBy,
      },
    });

    await updateQueue.add('update', { updateJobId: job.id }, { jobId: job.id, delay });

    return job;
  }

  /** Rollback (uniquement dans la fenetre 30min apres un update succeede). */
  async requestRollback(updateJobId: string) {
    const job = await prisma.tenantUpdateJob.findUnique({ where: { id: updateJobId } });
    if (!job) throw new NotFoundError('TenantUpdateJob', updateJobId);
    if (job.status !== 'succeeded') {
      throw new BusinessError(`Rollback impossible : job dans l'etat ${job.status}`);
    }
    if (!job.rollbackBefore || new Date() > job.rollbackBefore) {
      throw new BusinessError('Fenetre de rollback expiree.');
    }

    await rollbackQueue.add('rollback', { updateJobId }, { jobId: `rollback-${updateJobId}` });
    return job;
  }

  async listJobs(tenantId: string, limit = 20) {
    return prisma.tenantUpdateJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getJob(updateJobId: string) {
    const job = await prisma.tenantUpdateJob.findUnique({ where: { id: updateJobId } });
    if (!job) throw new NotFoundError('TenantUpdateJob', updateJobId);
    return job;
  }
}
