import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { BusinessError, ConflictError, NotFoundError } from '../../../domain/errors/BusinessError';

// Schemas migres dans @transitsoftservices/ops-schemas.
import {
  createPlanSchema,
  updatePlanSchema,
  type CreatePlanInput,
  type UpdatePlanInput,
} from '@transitsoftservices/ops-schemas';
export { createPlanSchema, updatePlanSchema };
export type { CreatePlanInput, UpdatePlanInput };

@injectable()
export class ResourcePlanUseCases {
  async list(filters: {
    isPublic?: boolean;
    isActive?: boolean;
    q?: string;
    page: number;
    pageSize: number;
  }) {
    const where = {
      ...(filters.isPublic !== undefined && { isPublic: filters.isPublic }),
      ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      ...(filters.q && {
        OR: [
          { code: { contains: filters.q, mode: 'insensitive' as const } },
          { name: { contains: filters.q, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.resourcePlan.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { pricePerMonth: 'asc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.resourcePlan.count({ where }),
    ]);
    return { items, total };
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
