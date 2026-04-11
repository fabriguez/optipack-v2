import { injectable } from 'tsyringe';
import type { Container, Prisma } from '@prisma/client';
import type { IContainerRepository, ContainerWithRelations } from '../../../application/interfaces/IContainerRepository';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';
import { prisma } from '../../../config/database';

const CONTAINER_INCLUDE = {
  departureAgency: { select: { id: true, name: true, code: true } },
  arrivalAgency: { select: { id: true, name: true, code: true } },
  transitRoute: { select: { id: true, name: true, type: true } },
  _count: { select: { parcels: true } },
};

@injectable()
export class PrismaContainerRepository implements IContainerRepository {
  async findById(id: string): Promise<ContainerWithRelations | null> {
    return prisma.container.findUnique({
      where: { id },
      include: CONTAINER_INCLUDE,
    }) as Promise<ContainerWithRelations | null>;
  }

  async findAll(
    filters: { departureAgencyId?: string; arrivalAgencyId?: string; status?: string; agencyIds?: string[] },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<ContainerWithRelations>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.ContainerWhereInput = {
      isDeleted: false,
      ...(filters.departureAgencyId && { departureAgencyId: filters.departureAgencyId }),
      ...(filters.arrivalAgencyId && { arrivalAgencyId: filters.arrivalAgencyId }),
      ...(filters.status && { status: filters.status as any }),
      ...(filters.agencyIds?.length && {
        OR: [
          { departureAgencyId: { in: filters.agencyIds } },
          { arrivalAgencyId: { in: filters.agencyIds } },
        ],
      }),
      ...(search && {
        OR: [
          { designation: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.container.findMany({
        where,
        skip,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
        include: CONTAINER_INCLUDE,
      }),
      prisma.container.count({ where }),
    ]);

    return {
      data: data as ContainerWithRelations[],
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async create(data: Prisma.ContainerCreateInput): Promise<Container> {
    return prisma.container.create({ data });
  }

  async update(id: string, data: Prisma.ContainerUpdateInput): Promise<Container> {
    return prisma.container.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await prisma.container.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }
}
