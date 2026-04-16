import type { Warehouse, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';

export interface IWarehouseRepository {
  findById(id: string): Promise<Warehouse | null>;
  findByAgency(
    agencyId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Warehouse>>;
  findByAgencies(
    agencyIds: string[],
    pagination: PaginationInput,
    agencyId?: string,
  ): Promise<PaginatedResponse<Warehouse>>;
  create(data: Prisma.WarehouseCreateInput): Promise<Warehouse>;
  update(id: string, data: Prisma.WarehouseUpdateInput): Promise<Warehouse>;
  delete(id: string): Promise<void>;
}

export const WAREHOUSE_REPOSITORY = Symbol.for('IWarehouseRepository');
