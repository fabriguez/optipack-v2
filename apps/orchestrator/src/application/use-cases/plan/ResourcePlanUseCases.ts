import { injectable } from 'tsyringe';
import { z } from 'zod';
import { prisma } from '../../../config/database';
import { BusinessError, ConflictError, NotFoundError } from '../../../domain/errors/BusinessError';

export const createPlanSchema = z.object({
  code: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, 'minuscules, chiffres, tirets'),
  name: z.string().min(2),
  description: z.string().optional(),
  pricePerMonth: z.number().nonnegative(),
  currency: z.string().default('XAF'),
  cpuLimit: z.number().positive(),
  memoryMb: z.number().int().positive(),
  diskQuotaGb: z.number().int().positive(),
  maxParcelsPerMonth: z.number().int().nonnegative().optional(),
  maxUsers: z.number().int().nonnegative().optional(),
  defaultModules: z.array(z.string()).optional().default([]),
  isPublic: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export const updatePlanSchema = createPlanSchema.partial().omit({ code: true });

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

@injectable()
export class ResourcePlanUseCases {
  async list(filters: { isPublic?: boolean; isActive?: boolean }) {
    return prisma.resourcePlan.findMany({
      where: {
        ...(filters.isPublic !== undefined && { isPublic: filters.isPublic }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      },
      orderBy: [{ sortOrder: 'asc' }, { pricePerMonth: 'asc' }],
    });
  }

  async getById(id: string) {
    const plan = await prisma.resourcePlan.findUnique({
      where: { id },
      include: { _count: { select: { tenants: true } } },
    });
    if (!plan) throw new NotFoundError('Plan', id);
    return plan;
  }

  async getByCode(code: string) {
    const plan = await prisma.resourcePlan.findUnique({ where: { code } });
    if (!plan) throw new NotFoundError('Plan', code);
    return plan;
  }

  async create(input: CreatePlanInput) {
    const dup = await prisma.resourcePlan.findUnique({ where: { code: input.code } });
    if (dup) throw new ConflictError(`Le plan "${input.code}" existe deja`);
    return prisma.resourcePlan.create({ data: { ...input, isActive: true } });
  }

  async update(id: string, input: UpdatePlanInput) {
    const plan = await prisma.resourcePlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundError('Plan', id);
    return prisma.resourcePlan.update({
      where: { id },
      data: input,
    });
  }

  async deactivate(id: string) {
    const plan = await prisma.resourcePlan.findUnique({
      where: { id },
      include: { _count: { select: { tenants: true } } },
    });
    if (!plan) throw new NotFoundError('Plan', id);
    if (plan._count.tenants > 0) {
      throw new BusinessError(
        `Impossible de desactiver : ${plan._count.tenants} tenant(s) utilisent ce plan. Migrez-les d'abord vers un autre plan.`,
      );
    }
    return prisma.resourcePlan.update({
      where: { id },
      data: { isActive: false, isPublic: false },
    });
  }
}
