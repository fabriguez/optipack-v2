import type { Agency, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface IAgencyRepository {
  findById(id: string): Promise<Agency | null>;
  findByCode(code: string): Promise<Agency | null>;
  findAll(
    organizationId: string,
    pagination: PaginationInput,
    filters?: { agencyIds?: string[]; activeOnly?: boolean },
  ): Promise<PaginatedResponse<Agency>>;
  create(data: Prisma.AgencyCreateInput): Promise<Agency>;
  update(id: string, data: Prisma.AgencyUpdateInput): Promise<Agency>;
  delete(id: string): Promise<void>;
  count(organizationId: string): Promise<number>;
}

export const AGENCY_REPOSITORY = Symbol.for('IAgencyRepository');
