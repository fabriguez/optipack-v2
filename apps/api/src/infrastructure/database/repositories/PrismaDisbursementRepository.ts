import { injectable } from 'tsyringe';
import type { DisbursementVoucher, Prisma } from '@prisma/client';
import type { IDisbursementRepository } from '../../../application/interfaces/IDisbursementRepository';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaDisbursementRepository implements IDisbursementRepository {
  async findById(id: string): Promise<DisbursementVoucher | null> {
    return prisma.disbursementVoucher.findUnique({
      where: { id },
      include: {
        agency: { select: { id: true, name: true, code: true } },
        issuedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findAll(
    filters: { agencyId?: string; agencyIds?: string[] },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<DisbursementVoucher>> {
    const { page, limit, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.DisbursementVoucherWhereInput = {
      ...(filters.agencyId && { agencyId: filters.agencyId }),
      ...(filters.agencyIds?.length && { agencyId: { in: filters.agencyIds } }),
      ...(search && { reference: { contains: search, mode: 'insensitive' } }),
    };

    const [data, total] = await Promise.all([
      prisma.disbursementVoucher.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          agency: { select: { id: true, name: true, code: true } },
          issuedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.disbursementVoucher.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async create(data: Prisma.DisbursementVoucherCreateInput): Promise<DisbursementVoucher> {
    return prisma.disbursementVoucher.create({ data });
  }

  async void(id: string, reason: string, reverseEntryId: string): Promise<DisbursementVoucher> {
    return prisma.disbursementVoucher.update({
      where: { id },
      data: { isVoided: true, voidedAt: new Date(), voidReason: reason, reverseEntryId },
    });
  }
}
