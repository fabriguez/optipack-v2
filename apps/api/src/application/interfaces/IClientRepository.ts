import type { Client, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';

export interface IClientRepository {
  findById(id: string): Promise<Client | null>;
  findByPhone(phone: string): Promise<Client | null>;
  findAll(
    filters: { organizationId?: string; agencyId?: string },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Client>>;
  create(data: Prisma.ClientCreateInput): Promise<Client>;
  update(id: string, data: Prisma.ClientUpdateInput): Promise<Client>;
  delete(id: string): Promise<void>;
}

export const CLIENT_REPOSITORY = Symbol.for('IClientRepository');
