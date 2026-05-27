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
