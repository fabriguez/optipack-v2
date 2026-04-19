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
    filters: { warehouseId?: string; containerId?: string; clientId?: string; status?: string; agencyIds?: string[] },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<ParcelWithRelations>>;
  findByContainer(containerId: string): Promise<Parcel[]>;
  create(data: Prisma.ParcelCreateInput): Promise<Parcel>;
  update(id: string, data: Prisma.ParcelUpdateInput): Promise<Parcel>;
  updateMany(ids: string[], data: Prisma.ParcelUpdateInput): Promise<number>;
  countByWarehouse(warehouseId: string): Promise<number>;
  countByStatus(agencyIds: string[]): Promise<Record<string, number>>;
}

export const PARCEL_REPOSITORY = Symbol.for('IParcelRepository');
