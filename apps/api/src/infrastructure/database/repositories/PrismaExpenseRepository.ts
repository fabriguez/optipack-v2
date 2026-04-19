import { injectable } from 'tsyringe';
import type { Expense, Prisma } from '@prisma/client';
import type { IExpenseRepository } from '../../../application/interfaces/IExpenseRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaExpenseRepository implements IExpenseRepository {
  async findById(id: string): Promise<Expense | null> {
    return prisma.expense.findUnique({
      where: { id },
      include: {
        agency: { select: { id: true, name: true, code: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findAll(
    filters: { agencyId?: string; agencyIds?: string[] },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Expense>> {
    const { page, limit, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.ExpenseWhereInput = {
      ...(filters.agencyId && { agencyId: filters.agencyId }),
      ...(filters.agencyIds?.length && { agencyId: { in: filters.agencyIds } }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { reason: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.expense.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { agency: { select: { id: true, name: true } } },
      }),
      prisma.expense.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async create(data: Prisma.ExpenseCreateInput): Promise<Expense> {
    return prisma.expense.create({ data });
  }

  async update(id: string, data: Prisma.ExpenseUpdateInput): Promise<Expense> {
    return prisma.expense.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await prisma.expense.delete({ where: { id } });
  }
}
