import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { prisma } from '../../../config/database';
import { BusinessError, ConflictError, NotFoundError } from '../../../domain/errors/BusinessError';
import { SSHService, SSH_SERVICE } from '../../../infrastructure/ssh/SSHService';
import {
  provisionQueue,
  freezeQueue,
  unfreezeQueue,
  deleteQueue,
  migrateQueue,
} from '../../../infrastructure/queue/queues';

const slugSchema = z
  .string()
  .min(2)
  .max(50)
  .regex(/^[a-z0-9-]+$/, 'slug : minuscules, chiffres, tirets uniquement');

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const createTenantSchema = z.object({
  slug: slugSchema,
  name: z.string().min(2),
  ownerEmail: z.string().email(),
  ownerUsername: z.string().min(2),
  vpsId: z.string().uuid(),
  customDomain: z.string().optional().nullable(),
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
  accentColor: hexColor.optional(),
  enabledModules: z.array(z.string()).optional(),
  logoUrl: z.string().url().optional().nullable(),
  plan: z.enum(['starter', 'pro', 'enterprise']).optional().default('starter'),
  pricePerMonth: z.number().nonnegative().optional().default(0),
  trialDays: z.number().int().nonnegative().optional().default(14),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = z.object({
  name: z.string().min(2).optional(),
  customDomain: z.string().optional().nullable(),
  enabledModules: z.array(z.string()).optional(),
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
  accentColor: hexColor.optional(),
  pinnedVersion: z.string().optional().nullable(),
  autoUpdatePolicy: z.enum(['MANUAL', 'AUTO_STABLE', 'AUTO_CRITICAL_ONLY']).optional(),
});

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

@injectable()
export class TenantUseCases {
  constructor(@inject(SSH_SERVICE) private ssh: SSHService) {}

  /**
   * Cree le record du tenant (status PROVISIONING) + son abonnement.
   * Le job de provisioning reel (Docker, Caddy, etc.) sera enqueue en Phase 2.
   */
  async create(input: CreateTenantInput) {
    const vps = await prisma.vPS.findUnique({ where: { id: input.vpsId } });
    if (!vps) throw new NotFoundError('VPS', input.vpsId);
    if (vps.status !== 'ACTIVE') {
      throw new BusinessError('Ce VPS n\'est pas actif. Utilisez un autre.');
    }

    // Slug unique
    const dupSlug = await prisma.tenant.findUnique({ where: { slug: input.slug } });
    if (dupSlug) throw new ConflictError(`Le slug "${input.slug}" est deja pris`);

    // Custom domain unique (si fourni)
    if (input.customDomain) {
      const dupDomain = await prisma.tenant.findUnique({
        where: { customDomain: input.customDomain },
      });
      if (dupDomain) throw new ConflictError(`Le domaine "${input.customDomain}" est deja utilise`);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.trialDays ?? 14) * 24 * 60 * 60 * 1000);
    const dbName = `tenant_${input.slug.replace(/-/g, '_')}_db`;

    const tenant = await prisma.tenant.create({
      data: {
        slug: input.slug,
        name: input.name,
        ownerEmail: input.ownerEmail,
        ownerUsername: input.ownerUsername,
        vpsId: input.vpsId,
        customDomain: input.customDomain ?? null,
        primaryColor: input.primaryColor ?? '#1B5E20',
        secondaryColor: input.secondaryColor ?? '#4CAF50',
        accentColor: input.accentColor ?? '#E8F5E9',
        enabledModules: input.enabledModules ?? [],
        logoUrl: input.logoUrl ?? null,
        dbName,
        status: 'PROVISIONING',
        subscription: {
          create: {
            plan: input.plan ?? 'starter',
            pricePerMonth: input.pricePerMonth ?? 0,
            startedAt: now,
            expiresAt,
          },
        },
      },
      include: { subscription: true, vps: { select: { id: true, name: true, host: true } } },
    });

    // Job de provisioning : record DB + enqueue BullMQ (Phase 2)
    const job = await prisma.provisioningJob.create({
      data: {
        tenantId: tenant.id,
        type: 'PROVISION',
        payload: {
          slug: tenant.slug,
          vpsId: tenant.vpsId,
          ownerEmail: tenant.ownerEmail,
        },
        status: 'queued',
      },
    });
    await provisionQueue.add(
      'provision',
      { tenantId: tenant.id, provisioningJobId: job.id },
      { jobId: job.id },
    );

    return tenant;
  }

  async list(filters: { status?: string; vpsId?: string }) {
    return prisma.tenant.findMany({
      where: {
        ...(filters.status && { status: filters.status as never }),
        ...(filters.vpsId && { vpsId: filters.vpsId }),
      },
      include: {
        vps: { select: { id: true, name: true, host: true, status: true } },
        subscription: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        vps: true,
        subscription: { include: { payments: { orderBy: { createdAt: 'desc' }, take: 10 } } },
        jobs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!tenant) throw new NotFoundError('Tenant', id);
    return tenant;
  }

  async update(id: string, input: UpdateTenantInput) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundError('Tenant', id);

    return prisma.tenant.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.customDomain !== undefined && { customDomain: input.customDomain }),
        ...(input.enabledModules !== undefined && { enabledModules: input.enabledModules }),
        ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
        ...(input.primaryColor !== undefined && { primaryColor: input.primaryColor }),
        ...(input.secondaryColor !== undefined && { secondaryColor: input.secondaryColor }),
        ...(input.accentColor !== undefined && { accentColor: input.accentColor }),
        ...(input.pinnedVersion !== undefined && { pinnedVersion: input.pinnedVersion }),
        ...(input.autoUpdatePolicy !== undefined && { autoUpdatePolicy: input.autoUpdatePolicy }),
      },
    });
  }

  async freeze(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundError('Tenant', id);
    if (tenant.status === 'FROZEN') return tenant;
    if (tenant.status === 'ARCHIVED') {
      throw new BusinessError('Impossible de freezer un tenant archive');
    }

    const job = await prisma.provisioningJob.create({
      data: { tenantId: id, type: 'FREEZE', payload: {}, status: 'queued' },
    });
    await freezeQueue.add('freeze', { tenantId: id, provisioningJobId: job.id }, { jobId: job.id });

    // Le worker fera la transition de statut effective. On retourne tenant tel quel.
    return tenant;
  }

  async unfreeze(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundError('Tenant', id);
    if (tenant.status !== 'FROZEN') {
      throw new BusinessError(`Statut actuel : ${tenant.status}. Le tenant n'est pas freeze.`);
    }

    const job = await prisma.provisioningJob.create({
      data: { tenantId: id, type: 'UNFREEZE', payload: {}, status: 'queued' },
    });
    await unfreezeQueue.add('unfreeze', { tenantId: id, provisioningJobId: job.id }, { jobId: job.id });

    return tenant;
  }

  async archive(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundError('Tenant', id);
    if (tenant.status === 'ARCHIVED') return tenant;

    const job = await prisma.provisioningJob.create({
      data: { tenantId: id, type: 'DELETE', payload: {}, status: 'queued' },
    });
    await deleteQueue.add('delete', { tenantId: id, provisioningJobId: job.id }, { jobId: job.id });

    return tenant;
  }

  /**
   * Historique des jobs de provisioning du tenant (PROVISION, MIGRATE, FREEZE, etc.)
   */
  async listJobs(tenantId: string, limit = 50) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    return prisma.provisioningJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }

  /**
   * Logs Docker live des conteneurs du tenant via SSH au VPS hote.
   * Utile pour debug rapide depuis ops-admin sans avoir a SSH manuel.
   */
  async getLogs(
    tenantId: string,
    options: { tail?: number; service?: 'api' | 'web' } = {},
  ): Promise<{ stdout: string; stderr: string }> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { vps: true },
    });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    if (!tenant.vps) throw new BusinessError('Tenant sans VPS associe');

    const tail = Math.min(Math.max(options.tail ?? 200, 1), 5000);
    const service = options.service ?? 'api';
    const containerName = `tenant-${tenant.slug}-${service}`;

    const result = await this.ssh.exec(
      {
        host: tenant.vps.host,
        port: tenant.vps.port,
        username: tenant.vps.username,
        sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
      },
      `docker logs --tail ${tail} ${containerName} 2>&1 || echo 'container not found: ${containerName}'`,
    );
    return { stdout: result.stdout, stderr: result.stderr };
  }

  async migrate(id: string, targetVpsId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundError('Tenant', id);
    if (tenant.vpsId === targetVpsId) {
      throw new BusinessError('Le tenant est deja sur ce VPS');
    }
    const target = await prisma.vPS.findUnique({ where: { id: targetVpsId } });
    if (!target) throw new NotFoundError('VPS cible', targetVpsId);
    if (target.status !== 'ACTIVE') throw new BusinessError('VPS cible inactif');

    const job = await prisma.provisioningJob.create({
      data: {
        tenantId: id,
        type: 'MIGRATE',
        payload: { fromVpsId: tenant.vpsId, toVpsId: targetVpsId },
        status: 'queued',
      },
    });
    await migrateQueue.add(
      'migrate',
      { tenantId: id, provisioningJobId: job.id, targetVpsId },
      { jobId: job.id },
    );

    return prisma.tenant.update({
      where: { id },
      data: { status: 'MIGRATING' },
    });
  }
}
