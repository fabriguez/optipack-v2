import { injectable } from 'tsyringe';
import type { FundTransfer, Prisma } from '@prisma/client';
import type { IFundTransferRepository } from '../../../application/interfaces/IFundTransferRepository';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaFundTransferRepository implements IFundTransferRepository {
  async findById(id: string): Promise<FundTransfer | null> {
    return prisma.fundTransfer.findUnique({
      where: { id },
      include: {
        sourceAgency: { select: { id: true, name: true, code: true } },
        initiatedBy: { select: { id: true, firstName: true, lastName: true } },
        confirmedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findAll(
    filters: { sourceAgencyId?: string; agencyIds?: string[] },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<FundTransfer>> {
    const { page, limit, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.FundTransferWhereInput = {
      ...(filters.sourceAgencyId && { sourceAgencyId: filters.sourceAgencyId }),
      ...(filters.agencyIds?.length && { sourceAgencyId: { in: filters.agencyIds } }),
      ...(search && { reference: { contains: search, mode: 'insensitive' } }),
    };

    const [data, total] = await Promise.all([
      prisma.fundTransfer.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sourceAgency: { select: { id: true, name: true, code: true } },
          initiatedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.fundTransfer.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async create(data: Prisma.FundTransferCreateInput): Promise<FundTransfer> {
    return prisma.fundTransfer.create({ data });
  }

  async update(id: string, data: Prisma.FundTransferUpdateInput): Promise<FundTransfer> {
    return prisma.fundTransfer.update({ where: { id }, data });
  }
}
