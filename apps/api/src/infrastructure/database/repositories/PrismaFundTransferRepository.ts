import { injectable } from 'tsyringe';
import type { FundTransfer, Prisma } from '@prisma/client';
import type { IFundTransferRepository } from '../../../application/interfaces/IFundTransferRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaFundTransferRepository implements IFundTransferRepository {
  async findById(id: string): Promise<FundTransfer | null> {
    return prisma.fundTransfer.findUnique({
      where: { id },
      include: {
        sourceAgency: { select: { id: true, name: true, code: true } },
        sourceOrganization: { select: { id: true, name: true } },
        destinationAgency: { select: { id: true, name: true, code: true } },
        initiatedBy: { select: { id: true, firstName: true, lastName: true } },
        confirmedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findAll(
    filters: {
      sourceAgencyId?: string;
      sourceOrganizationId?: string;
      sourceType?: 'AGENCY' | 'HQ';
      destinationAgencyId?: string;
      agencyIds?: string[];
      reference?: string;
      status?: 'PENDING' | 'CONFIRMED' | 'VOIDED';
      dateFrom?: string;
      dateTo?: string;
      sourcePaymentMethod?: string;
      destinationPaymentMethod?: string;
      minAmount?: number;
      maxAmount?: number;
    },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<FundTransfer>> {
    const { page, limit, search } = pagination;
    const skip = (page - 1) * limit;

    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.dateFrom) createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) createdAt.lte = new Date(filters.dateTo);

    const amount: Prisma.DecimalFilter = {};
    if (filters.minAmount !== undefined) amount.gte = filters.minAmount;
    if (filters.maxAmount !== undefined) amount.lte = filters.maxAmount;

    const where: Prisma.FundTransferWhereInput = {
      ...(filters.sourceAgencyId && { sourceAgencyId: filters.sourceAgencyId }),
      ...(filters.sourceOrganizationId && { sourceOrganizationId: filters.sourceOrganizationId }),
      ...(filters.sourceType && { sourceType: filters.sourceType }),
      ...(filters.destinationAgencyId && { destinationAgencyId: filters.destinationAgencyId }),
      ...(filters.agencyIds?.length && !filters.sourceAgencyId && !filters.sourceOrganizationId && { sourceAgencyId: { in: filters.agencyIds } }),
      ...(filters.status && { status: filters.status }),
      ...(filters.sourcePaymentMethod && { sourcePaymentMethod: filters.sourcePaymentMethod }),
      ...(filters.destinationPaymentMethod && { destinationPaymentMethod: filters.destinationPaymentMethod }),
      ...((filters.reference || search) && {
        reference: { contains: filters.reference || search, mode: 'insensitive' },
      }),
      ...(Object.keys(createdAt).length && { createdAt }),
      ...(Object.keys(amount).length && { amount }),
    };

    const [data, total] = await Promise.all([
      prisma.fundTransfer.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sourceAgency: { select: { id: true, name: true, code: true } },
          sourceOrganization: { select: { id: true, name: true } },
          destinationAgency: { select: { id: true, name: true, code: true } },
          initiatedBy: { select: { id: true, firstName: true, lastName: true } },
          confirmedBy: { select: { id: true, firstName: true, lastName: true } },
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
