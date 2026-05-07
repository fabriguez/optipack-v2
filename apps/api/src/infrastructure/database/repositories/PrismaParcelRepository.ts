import { injectable } from 'tsyringe';
import type { Parcel, Prisma } from '@prisma/client';
import type { IParcelRepository, ParcelWithRelations } from '../../../application/interfaces/IParcelRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

const PARCEL_INCLUDE = {
  client: { select: { id: true, fullName: true, phone: true } },
  recipient: { select: { id: true, fullName: true, phone: true } },
  warehouse: {
    select: {
      id: true, name: true,
      agency: { select: { id: true, name: true } },
    },
  },
  container: { select: { id: true, designation: true } },
  transitRoute: { select: { id: true, name: true, type: true } },
  invoice: { select: { id: true, reference: true, status: true } },
};

@injectable()
export class PrismaParcelRepository implements IParcelRepository {
  async findById(id: string): Promise<ParcelWithRelations | null> {
    return prisma.parcel.findUnique({
      where: { id },
      include: PARCEL_INCLUDE,
    }) as Promise<ParcelWithRelations | null>;
  }

  async findByTracking(trackingNumber: string): Promise<ParcelWithRelations | null> {
    return prisma.parcel.findUnique({
      where: { trackingNumber },
      include: PARCEL_INCLUDE,
    }) as Promise<ParcelWithRelations | null>;
  }

  async findAll(
    filters: {
      warehouseId?: string;
      containerId?: string;
      // Filtre "issu de ce conteneur" : utilise lastContainerId (apres dechargement).
      lastContainerId?: string;
      // Espace de rangement
      spaceId?: string;
      // Filtre par origine (text libre)
      origin?: string;
      clientId?: string;
      status?: string;
      transitType?: string;
      agencyIds?: string[] | null;
      onlyPresent?: boolean;
    },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<ParcelWithRelations>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const presenceFilter = filters.onlyPresent
      ? { isPresent: true, status: { in: ['IN_STOCK', 'RECEIVED'] as any } }
      : {};

    const where: Prisma.ParcelWhereInput = {
      isDeleted: false,
      ...(filters.warehouseId && { warehouseId: filters.warehouseId }),
      ...(filters.containerId && { containerId: filters.containerId }),
      ...(filters.lastContainerId && { lastContainerId: filters.lastContainerId }),
      ...(filters.spaceId && { spaceId: filters.spaceId }),
      ...(filters.origin && { origin: { contains: filters.origin, mode: 'insensitive' } }),
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(filters.status && { status: filters.status as any }),
      ...(filters.transitType && { transitRoute: { type: filters.transitType as any } }),
      ...(filters.agencyIds?.length && {
        warehouse: { agencyId: { in: filters.agencyIds } },
      }),
      ...presenceFilter,
      ...(search && {
        OR: [
          { trackingNumber: { contains: search, mode: 'insensitive' } },
          { designation: { contains: search, mode: 'insensitive' } },
          { client: { fullName: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.parcel.findMany({
        where,
        skip,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
        include: PARCEL_INCLUDE,
      }),
      prisma.parcel.count({ where }),
    ]);

    return {
      data: data as ParcelWithRelations[],
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByContainer(containerId: string): Promise<Parcel[]> {
    return prisma.parcel.findMany({ where: { containerId, isDeleted: false } });
  }

  async create(data: Prisma.ParcelCreateInput): Promise<Parcel> {
    return prisma.parcel.create({ data });
  }

  async update(id: string, data: Prisma.ParcelUpdateInput): Promise<Parcel> {
    return prisma.parcel.update({ where: { id }, data });
  }

  async updateMany(ids: string[], data: Prisma.ParcelUpdateInput): Promise<number> {
    const result = await prisma.parcel.updateMany({
      where: { id: { in: ids } },
      data: data as Prisma.ParcelUpdateManyMutationInput,
    });
    return result.count;
  }

  async countByWarehouse(warehouseId: string): Promise<number> {
    return prisma.parcel.count({ where: { warehouseId, isDeleted: false } });
  }

  async countByStatus(agencyIds: string[]): Promise<Record<string, number>> {
    const results = await prisma.parcel.groupBy({
      by: ['status'],
      where: {
        isDeleted: false,
        warehouse: { agencyId: { in: agencyIds } },
      },
      _count: true,
    });
    const counts: Record<string, number> = {};
    for (const r of results) {
      counts[r.status] = r._count;
    }
    return counts;
  }
}
