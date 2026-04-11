import { injectable } from 'tsyringe';
import type { Debt, Prisma } from '@prisma/client';
import type { IDebtRepository } from '../../../application/interfaces/IDebtRepository';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaDebtRepository implements IDebtRepository {
  async findById(id: string): Promise<Debt | null> {
    return prisma.debt.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, fullName: true, phone: true } },
        invoice: { select: { id: true, reference: true } },
      },
    });
  }

  async findByClient(clientId: string): Promise<Debt[]> {
    return prisma.debt.findMany({
      where: { clientId, isCleared: false },
      orderBy: { nextDueDate: 'asc' },
    });
  }

  async findAll(
    filters: { clientId?: string; status?: string },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Debt>> {
    const { page, limit, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.DebtWhereInput = {
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(filters.status && { status: filters.status as any }),
      ...(search && {
        client: { fullName: { contains: search, mode: 'insensitive' } },
      }),
    };

    const [data, total] = await Promise.all([
      prisma.debt.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, fullName: true, phone: true } },
          invoice: { select: { id: true, reference: true } },
        },
      }),
      prisma.debt.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOverdue(): Promise<Debt[]> {
    return prisma.debt.findMany({
      where: {
        isCleared: false,
        nextDueDate: { lt: new Date() },
      },
      include: {
        client: { select: { id: true, fullName: true, phone: true } },
      },
    });
  }

  async create(data: Prisma.DebtCreateInput): Promise<Debt> {
    return prisma.debt.create({ data });
  }

  async update(id: string, data: Prisma.DebtUpdateInput): Promise<Debt> {
    return prisma.debt.update({ where: { id }, data });
  }
}
