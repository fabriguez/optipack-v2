import type { Parcel, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface ParcelWithRelations extends Parcel {
  client?: { id: string; fullName: string; phone: string };
  recipient?: { id: string; fullName: string; phone: string } | null;
  warehouse?: { id: string; name: string; agency: { id: string; name: string } } | null;
  container?: { id: string; designation: string } | null;
  transitRoute?: { id: string; name: string; type: string } | null;
  invoice?: { id: string; reference: string; status: string } | null;
}

/**
 * Valeurs distinctes disponibles pour les filtres d'un listing de colis,
 * calculees SUR le perimetre du listing (ex: colis presents d'un magasin) et
 * non sur toute la base. Alimente les selects de filtre cote client.
 */
export interface ParcelFilterFacets {
  containers: { id: string; label: string }[];
  clients: { id: string; label: string }[];
  zones: { id: string; label: string }[];
  destinations: string[];
  statuses: string[];
  routes: { id: string; label: string }[];
}

export interface IParcelRepository {
  findById(id: string): Promise<ParcelWithRelations | null>;
  findByTracking(trackingNumber: string): Promise<ParcelWithRelations | null>;
  findAll(
    filters: {
      warehouseId?: string;
      containerId?: string;
      lastContainerId?: string;
      spaceId?: string;
      origin?: string;
      destination?: string;
      parcelGroupId?: string;
      clientId?: string;
      status?: string;
      transitType?: string;
      agencyIds?: string[] | null;
      onlyPresent?: boolean;
      archived?: 'true' | 'all' | 'false';
    },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<ParcelWithRelations>>;
  /** Valeurs distinctes de filtre presentes dans le perimetre donne. */
  findFilterFacets(filters: {
    warehouseId?: string;
    agencyIds?: string[] | null;
    scopeWhere?: object | null;
    onlyPresent?: boolean;
    archived?: 'true' | 'all' | 'false';
  }): Promise<ParcelFilterFacets>;
  findByContainer(containerId: string): Promise<Parcel[]>;
  /**
   * Snapshot des colis presents dans le conteneur a l'arrivee : tous les
   * colis charges dans ce conteneur (containerId courant OU lastContainerId
   * apres dechargement). Sert au calcul du benefice qui ne doit pas baisser
   * au fur et a mesure du dechargement.
   */
  findArrivalSnapshot(containerId: string): Promise<Parcel[]>;
  create(data: Prisma.ParcelCreateInput): Promise<Parcel>;
  update(id: string, data: Prisma.ParcelUpdateInput): Promise<Parcel>;
  updateMany(ids: string[], data: Prisma.ParcelUpdateInput): Promise<number>;
  countByWarehouse(warehouseId: string): Promise<number>;
  countByStatus(agencyIds: string[]): Promise<Record<string, number>>;
}

export const PARCEL_REPOSITORY = Symbol.for('IParcelRepository');
