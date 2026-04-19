import { injectable } from 'tsyringe';
import type { LoyaltyTransaction, Prisma } from '@prisma/client';
import type { ILoyaltyRepository } from '../../../application/interfaces/ILoyaltyRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaLoyaltyRepository implements ILoyaltyRepository {
  async findByClient(
    clientId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<LoyaltyTransaction>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.LoyaltyTransactionWhereInput = { clientId };

    const [data, total] = await Promise.all([
      prisma.loyaltyTransaction.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.loyaltyTransaction.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async create(data: Prisma.LoyaltyTransactionCreateInput): Promise<LoyaltyTransaction> {
    return prisma.loyaltyTransaction.create({ data });
  }

  async sumPointsByClient(clientId: string): Promise<number> {
    const result = await prisma.loyaltyTransaction.aggregate({
      where: { clientId },
      _sum: { points: true },
    });
    return result._sum.points || 0;
  }
}
