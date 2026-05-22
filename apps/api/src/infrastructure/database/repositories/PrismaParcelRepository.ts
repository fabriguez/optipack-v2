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
  // Zone de rangement (WarehouseSpace) du colis. Necessaire pour afficher
  // l'emplacement dans les listes magasin / inventaire.
  space: { select: { id: true, name: true } },
  // Inclure les agences depart/arrivee du conteneur permet a l'UI d'afficher
  // les liens cliquables "en transit de X vers Y" et "arrive a <agence>" sans
  // requete supplementaire (fetch sur la page parcel detail / list).
  container: {
    select: {
      id: true,
      designation: true,
      departureAgency: { select: { id: true, name: true, city: true } },
      arrivalAgency: { select: { id: true, name: true, city: true } },
    },
  },
  // Conteneur de livraison : le DERNIER conteneur d'ou le colis a ete decharge
  // (set lors du dechargement). Persiste meme apres dechargement, contrairement
  // a `container` (currentContainerId) qui est null pour les colis en stock.
  // Utile pour afficher la provenance dans les listes magasin.
  lastContainer: {
    select: {
      id: true,
      designation: true,
      departureAgency: { select: { id: true, name: true, city: true } },
      arrivalAgency: { select: { id: true, name: true, city: true } },
    },
  },
  transitRoute: { select: { id: true, name: true, type: true } },
  invoice: { select: { id: true, reference: true, status: true } },
  // Premier conteneur traverse par le colis : derive du 1er evenement
  // d'historique portant un containerId (ordre chronologique asc). Sert a
  // l'affichage "conteneur d'origine" dans les listes magasin.
  histories: {
    where: { containerId: { not: null } },
    orderBy: { createdAt: 'asc' as const },
    take: 1,
    select: {
      container: { select: { id: true, designation: true } },
    },
  },
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
      // Filtre par groupe de colis (envoi groupe)
      parcelGroupId?: string;
      clientId?: string;
      status?: string;
      transitType?: string;
      agencyIds?: string[] | null;
      onlyPresent?: boolean;
      // Archive : par defaut les archives sont exclues. archived='true' filtre
      // pour ne retourner QUE les archives ; archived='all' inclut tout.
      archived?: 'true' | 'all' | 'false';
    },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<ParcelWithRelations>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const presenceFilter = filters.onlyPresent
      ? { isPresent: true, status: { in: ['IN_STOCK', 'RECEIVED'] as any } }
      : {};

    // Filtre archive : exclu par defaut sauf opt-in explicite.
    const archivedFilter =
      filters.archived === 'true'
        ? { isArchived: true }
        : filters.archived === 'all'
          ? {}
          : { isArchived: false };

    const where: Prisma.ParcelWhereInput = {
      isDeleted: false,
      ...archivedFilter,
      ...(filters.warehouseId && { warehouseId: filters.warehouseId }),
      ...(filters.containerId && { containerId: filters.containerId }),
      ...(filters.lastContainerId && { lastContainerId: filters.lastContainerId }),
      ...(filters.spaceId && { spaceId: filters.spaceId }),
      ...(filters.origin && { origin: { contains: filters.origin, mode: 'insensitive' } }),
      ...(filters.parcelGroupId && { parcelGroupId: filters.parcelGroupId }),
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
    // Aligne avec le listing du detail magasin : colis physiquement presents,
    // non archives, en stock / receptionne.
    return prisma.parcel.count({
      where: {
        warehouseId,
        isDeleted: false,
        isArchived: false,
        isPresent: true,
        status: { in: ['IN_STOCK', 'RECEIVED'] },
      },
    });
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
