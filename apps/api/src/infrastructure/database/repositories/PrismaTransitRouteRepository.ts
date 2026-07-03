import { injectable } from 'tsyringe';
import type { TransitRoute, Prisma } from '@prisma/client';
import type { ITransitRouteRepository } from '../../../application/interfaces/ITransitRouteRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { safeOrderBy } from '../../../domain/utils/safeOrderBy';

// Colonnes scalaires triables (allowlist anti sort-injection).
const TRANSIT_ROUTE_SORTABLE = [
  'id',
  'name',
  'type',
  'departureCity',
  'departureCountry',
  'arrivalCity',
  'arrivalCountry',
  'pricePerKg',
  'pricePerVolume',
  'estimatedDurationDays',
  'isActive',
  'createdAt',
  'updatedAt',
];

@injectable()
export class PrismaTransitRouteRepository implements ITransitRouteRepository {
  async findById(id: string): Promise<TransitRoute | null> {
    return prisma.transitRoute.findUnique({ where: { id } });
  }

  async findAll(
    organizationId: string,
    pagination: PaginationInput,
    filters?: { type?: string },
  ): Promise<PaginatedResponse<TransitRoute>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    // `type` accepte un seul TransitType (ex: "AIR") ou plusieurs en CSV
    // (ex: "AIR,LAND") pour filtrer par mode de pesee cote UI :
    //   masse  -> AIR + LAND (pas de SEA en kg)
    //   volume -> SEA + LAND
    //   both   -> aucun filtre (toutes)
    const typeFilter = filters?.type
      ? filters.type.includes(',')
        ? { in: filters.type.split(',').map((t) => t.trim()).filter(Boolean) as any[] }
        : (filters.type as any)
      : undefined;

    const where: Prisma.TransitRouteWhereInput = {
      organizationId,
      ...(typeFilter && { type: typeFilter }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { departureCity: { contains: search, mode: 'insensitive' } },
          { arrivalCity: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.transitRoute.findMany({
        where,
        skip,
        take: limit,
        orderBy: safeOrderBy(sortBy, sortOrder, TRANSIT_ROUTE_SORTABLE, 'createdAt'),
      }),
      prisma.transitRoute.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findActive(organizationId: string): Promise<TransitRoute[]> {
    return prisma.transitRoute.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(data: Prisma.TransitRouteCreateInput): Promise<TransitRoute> {
    return prisma.transitRoute.create({ data });
  }

  async update(id: string, data: Prisma.TransitRouteUpdateInput): Promise<TransitRoute> {
    return prisma.transitRoute.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await prisma.transitRoute.update({ where: { id }, data: { isActive: false } });
  }
}
