import { injectable } from 'tsyringe';
import type { Container, Prisma } from '@prisma/client';
import type { IContainerRepository, ContainerWithRelations } from '../../../application/interfaces/IContainerRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { safeOrderBy } from '../../../domain/utils/safeOrderBy';

// Colonnes scalaires triables (allowlist anti sort-injection).
const CONTAINER_SORTABLE = [
  'id',
  'designation',
  'type',
  'status',
  'carrierCost',
  'capacity',
  'currentLoad',
  'loadingDate',
  'departureDate',
  'estimatedArrivalDate',
  'actualArrivalDate',
  'createdAt',
  'updatedAt',
];

const CONTAINER_INCLUDE = {
  departureAgency: { select: { id: true, name: true, code: true, imageUrl: true, city: true } },
  arrivalAgency: { select: { id: true, name: true, code: true, imageUrl: true, city: true } },
  transitRoute: { select: { id: true, name: true, type: true } },
  parentContainer: { select: { id: true, designation: true, type: true, isForwarding: true } },
  childContainers: { select: { id: true, designation: true, type: true } },
  // Liens M:N : pour un conteneur d'acheminement, liste des conteneurs
  // parents auquels il est lie (via colis communs).
  forwardingParents: {
    include: {
      parent: { select: { id: true, designation: true, type: true, status: true } },
    },
  },
  // Liens inverses : pour un conteneur "standard", liste des conteneurs
  // d'acheminement qui contiennent au moins un colis de ce conteneur.
  forwardingChildren: {
    include: {
      forwarding: { select: { id: true, designation: true, type: true, status: true, isForwarding: true } },
    },
  },
  _count: { select: { parcels: true, childContainers: true } },
};

/**
 * Audit fix #4 : `currentLoad` peut driver. On recalcule a la volee a chaque
 * lecture. La dimension agregee depend du type de conteneur :
 *  - AIR  -> somme des masses (kg)
 *  - SEA  -> somme des volumes (m3)
 *  - LAND -> somme des masses (kg) par defaut (capacite exprimee en kg)
 * Sans ca, un conteneur SEA charge de colis tarifes au volume affichait
 * toujours 0 (les colis volume ont weight=null).
 */
async function refreshCurrentLoad(container: Container | null): Promise<Container | null> {
  if (!container) return null;
  const useVolume = container.type === 'SEA';
  const result = await prisma.parcel.aggregate({
    _sum: { weight: true, volume: true },
    where: { containerId: container.id, isDeleted: false },
  });
  const real = Number((useVolume ? result._sum.volume : result._sum.weight) ?? 0);
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
      carrierId?: string;
      /** Plage sur departureDate (date de depart du conteneur). */
      departureDateFrom?: string;
      departureDateTo?: string;
      /** Plage sur actualArrivalDate (date d'arrivee effective). */
      arrivalDateFrom?: string;
      arrivalDateTo?: string;
      scopeWhere?: object | null;
    },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<ContainerWithRelations>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    // Plage de dates inclusive : gte = debut du jour "from", lte = fin du jour "to".
    const dayRange = (from?: string, to?: string): { gte?: Date; lte?: Date } | undefined => {
      const r: { gte?: Date; lte?: Date } = {};
      if (from) r.gte = new Date(from);
      if (to) {
        const d = new Date(to);
        d.setHours(23, 59, 59, 999);
        r.lte = d;
      }
      return r.gte || r.lte ? r : undefined;
    };
    const departureDateRange = dayRange(filters.departureDateFrom, filters.departureDateTo);
    const arrivalDateRange = dayRange(filters.arrivalDateFrom, filters.arrivalDateTo);

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
      ...(filters.carrierId && { carrierId: filters.carrierId }),
      ...(departureDateRange && { departureDate: departureDateRange }),
      ...(arrivalDateRange && { actualArrivalDate: arrivalDateRange }),
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
      // Scope agence : merge en AND pour ne pas ecraser les OR existants.
      ...(filters.scopeWhere && { AND: [filters.scopeWhere as Prisma.ContainerWhereInput] }),
    };

    const [data, total] = await Promise.all([
      prisma.container.findMany({
        where,
        skip,
        take: limit,
        orderBy: safeOrderBy(sortBy, sortOrder, CONTAINER_SORTABLE, 'createdAt'),
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
