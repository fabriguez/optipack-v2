import { injectable } from 'tsyringe';
import type { Penalty, Prisma } from '@prisma/client';
import type { IPenaltyRepository } from '../../../application/interfaces/IPenaltyRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaPenaltyRepository implements IPenaltyRepository {
  async findById(id: string): Promise<Penalty | null> {
    return prisma.penalty.findUnique({
      where: { id },
      include: {
        parcel: { select: { id: true, trackingNumber: true, designation: true } },
        client: { select: { id: true, fullName: true, phone: true } },
        agency: { select: { id: true, name: true } },
      },
    });
  }

  async findByParcel(parcelId: string): Promise<Penalty | null> {
    return prisma.penalty.findFirst({ where: { parcelId, isPaid: false } });
  }

  async findAll(
    filters: { agencyId?: string; clientId?: string; isPaid?: boolean },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Penalty>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.PenaltyWhereInput = {
      ...(filters.agencyId && { agencyId: filters.agencyId }),
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(filters.isPaid !== undefined && { isPaid: filters.isPaid }),
    };

    const [data, total] = await Promise.all([
      prisma.penalty.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          parcel: { select: { id: true, trackingNumber: true, designation: true } },
          client: { select: { id: true, fullName: true } },
        },
      }),
      prisma.penalty.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findParcelsEligibleForPenalty(graceDays: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - graceDays);

    const parcels = await prisma.parcel.findMany({
      where: {
        status: { in: ['ARRIVED', 'RECEIVED'] },
        penaltyStartDate: { lte: cutoffDate },
        isDeleted: false,
        isPresent: true,
      },
      select: {
        id: true,
        clientId: true,
        penaltyStartDate: true,
        warehouse: { select: { agencyId: true } },
      },
    });

    return parcels
      .filter((p) => p.warehouse && p.penaltyStartDate)
      .map((p) => ({
        parcelId: p.id,
        clientId: p.clientId,
        agencyId: p.warehouse!.agencyId,
        arrivalDate: p.penaltyStartDate!,
      }));
  }

  async create(data: Prisma.PenaltyCreateInput): Promise<Penalty> {
    return prisma.penalty.create({ data });
  }

  async update(id: string, data: Prisma.PenaltyUpdateInput): Promise<Penalty> {
    return prisma.penalty.update({ where: { id }, data });
  }
}
