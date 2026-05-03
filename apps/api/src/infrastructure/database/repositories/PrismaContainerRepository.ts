import { injectable } from 'tsyringe';
import type { Container, Prisma } from '@prisma/client';
import type { IContainerRepository, ContainerWithRelations } from '../../../application/interfaces/IContainerRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

const CONTAINER_INCLUDE = {
  departureAgency: { select: { id: true, name: true, code: true } },
  arrivalAgency: { select: { id: true, name: true, code: true } },
  transitRoute: { select: { id: true, name: true, type: true } },
  parentContainer: { select: { id: true, designation: true, type: true, isForwarding: true } },
  childContainers: { select: { id: true, designation: true, type: true } },
  _count: { select: { parcels: true, childContainers: true } },
};

/**
 * Audit fix #4 : `currentLoad` peut driver (transactions a moitie executees,
 * weight de colis modifies, etc.). On recalcule a la volee a chaque lecture
 * via SUM(parcels.weight). Le champ snapshot reste en DB pour requetes filtrees.
 */
async function refreshCurrentLoad(container: Container | null): Promise<Container | null> {
  if (!container) return null;
  const result = await prisma.parcel.aggregate({
    _sum: { weight: true },
    where: { containerId: container.id, isDeleted: false },
  });
  const real = Number(result._sum.weight ?? 0);
  if (Math.abs(Number(container.currentLoad) - real) > 0.001) {
    // Drift detecte : on update silencieusement et on retourne la vraie valeur
    await prisma.container.update({
      where: { id: container.id },
      data: { currentLoad: real },
    });
    return { ...container, currentLoad: real as never };
  }
  return container;
}

@injectable()
export class PrismaContainerRepository implements IContainerRepository {
  async findById(id: string): Promise<ContainerWithRelations | null> {
    const c = await prisma.container.findUnique({
      where: { id },
      include: CONTAINER_INCLUDE,
    });
    return (await refreshCurrentLoad(c as never)) as ContainerWithRelations | null;
  }

  async findAll(
    filters: {
      departureAgencyId?: string;
      arrivalAgencyId?: string;
      status?: string;
      isForwarding?: boolean;
      agencyIds?: string[];
    },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<ContainerWithRelations>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    // status peut etre une liste separee par virgule (ex : "EMPTY,LOADING")
    const statusFilter = filters.status?.includes(',')
      ? { in: filters.status.split(',').map((s) => s.trim()) as never }
      : filters.status
        ? (filters.status as never)
        : undefined;

    const where: Prisma.ContainerWhereInput = {
      isDeleted: false,
      ...(filters.departureAgencyId && { departureAgencyId: filters.departureAgencyId }),
      ...(filters.arrivalAgencyId && { arrivalAgencyId: filters.arrivalAgencyId }),
      ...(statusFilter !== undefined && { status: statusFilter }),
      ...(filters.isForwarding !== undefined && { isForwarding: filters.isForwarding }),
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

    // Recalcul en batch via aggregation groupBy pour eviter N+1
    if (data.length > 0) {
      const ids = data.map((d) => d.id);
      const sums = await prisma.parcel.groupBy({
        by: ['containerId'],
        where: { containerId: { in: ids }, isDeleted: false },
        _sum: { weight: true },
      });
      const sumByContainer = new Map(sums.map((s) => [s.containerId!, Number(s._sum.weight ?? 0)]));
      for (const c of data) {
        const real = sumByContainer.get(c.id) ?? 0;
        if (Math.abs(Number(c.currentLoad) - real) > 0.001) {
          (c as { currentLoad: unknown }).currentLoad = real;
        }
      }
    }

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
