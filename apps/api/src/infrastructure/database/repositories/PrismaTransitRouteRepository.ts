import { injectable } from 'tsyringe';
import type { TransitRoute, Prisma } from '@prisma/client';
import type { ITransitRouteRepository } from '../../../application/interfaces/ITransitRouteRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaTransitRouteRepository implements ITransitRouteRepository {
  async findById(id: string): Promise<TransitRoute | null> {
    return prisma.transitRoute.findUnique({ where: { id } });
  }

  async findAll(
    organizationId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<TransitRoute>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.TransitRouteWhereInput = {
      organizationId,
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
        orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
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
