import { injectable } from 'tsyringe';
import type { Penalty, Prisma } from '@prisma/client';
import type { IPenaltyRepository } from '../../../application/interfaces/IPenaltyRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

/**
 * Audit fix #8 : `daysAccumulated` et `totalAmount` ne sont PAS stockes a jour en BDD
 * (ils drift dans le temps). On les recalcule a la lecture depuis startDate + dailyRate.
 * Les valeurs DB ne sont snapshot qu'au moment de la facturation (penalty.invoiceId set).
 */
function computePenalty<T extends Penalty>(penalty: T): T {
  // Si deja paye/facture, on garde les valeurs snapshot
  if (penalty.isPaid || penalty.invoiceId) return penalty;

  const start = penalty.startDate ? new Date(penalty.startDate as never) : null;
  if (!start) return penalty;

  const now = new Date();
  const days = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const total = days * Number(penalty.dailyRate);

  return {
    ...penalty,
    daysAccumulated: days as never,
    totalAmount: total as never,
  };
}

@injectable()
export class PrismaPenaltyRepository implements IPenaltyRepository {
  async findById(id: string): Promise<Penalty | null> {
    const p = await prisma.penalty.findUnique({
      where: { id },
      include: {
        parcel: { select: { id: true, trackingNumber: true, designation: true } },
        client: { select: { id: true, fullName: true, phone: true } },
        agency: { select: { id: true, name: true } },
      },
    });
    return p ? computePenalty(p as Penalty) : null;
  }

  async findByParcel(parcelId: string): Promise<Penalty | null> {
    const p = await prisma.penalty.findFirst({ where: { parcelId, isPaid: false } });
    return p ? computePenalty(p) : null;
  }

  async findAll(
    filters: { agencyId?: string; clientId?: string; isPaid?: boolean; scopeWhere?: object | null },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Penalty>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.PenaltyWhereInput = {
      ...(filters.agencyId && { agencyId: filters.agencyId }),
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(filters.isPaid !== undefined && { isPaid: filters.isPaid }),
      // Scope agence (etape 2) : merge en AND.
      ...(filters.scopeWhere && { AND: [filters.scopeWhere as Prisma.PenaltyWhereInput] }),
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

    return {
      data: data.map((p) => computePenalty(p)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
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
