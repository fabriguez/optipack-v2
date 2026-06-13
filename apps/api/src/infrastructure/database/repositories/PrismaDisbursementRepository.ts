import { injectable } from 'tsyringe';
import type { DisbursementVoucher, Prisma } from '@prisma/client';
import type { IDisbursementRepository } from '../../../application/interfaces/IDisbursementRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
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
    filters: {
      agencyId?: string;
      agencyIds?: string[];
      ordererUserId?: string;
      dateFrom?: string;
      dateTo?: string;
      containerId?: string;
      parcelId?: string;
      clientId?: string;
      scopeWhere?: object | null;
    },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<DisbursementVoucher>> {
    const { page, limit, search } = pagination;
    const skip = (page - 1) * limit;

    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.dateFrom) createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) createdAt.lte = new Date(filters.dateTo);

    const where: Prisma.DisbursementVoucherWhereInput = {
      ...(filters.agencyId && { agencyId: filters.agencyId }),
      ...(filters.agencyIds?.length && !filters.agencyId && { agencyId: { in: filters.agencyIds } }),
      ...(filters.ordererUserId && { ordererUserId: filters.ordererUserId }),
      ...(filters.containerId && { containerId: filters.containerId }),
      ...(filters.parcelId && { parcelId: filters.parcelId }),
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(search && { reference: { contains: search, mode: 'insensitive' } }),
      ...(Object.keys(createdAt).length && { createdAt }),
      // Scope agence : en AND pour ne pas ecraser les autres filtres.
      ...(filters.scopeWhere && { AND: [filters.scopeWhere as Prisma.DisbursementVoucherWhereInput] }),
    };

    const [data, total] = await Promise.all([
      prisma.disbursementVoucher.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          agency: { select: { id: true, name: true, code: true } },
          issuedBy: { select: { id: true, firstName: true, lastName: true } },
          ordererUser: { select: { id: true, firstName: true, lastName: true } },
          container: { select: { id: true, designation: true } },
          parcel: { select: { id: true, trackingNumber: true } },
          client: { select: { id: true, fullName: true } },
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
