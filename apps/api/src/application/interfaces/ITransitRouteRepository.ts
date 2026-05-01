import type { TransitRoute, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface ITransitRouteRepository {
  findById(id: string): Promise<TransitRoute | null>;
  findAll(
    organizationId: string,
    pagination: PaginationInput,
    filters?: { type?: string },
  ): Promise<PaginatedResponse<TransitRoute>>;
  findActive(organizationId: string): Promise<TransitRoute[]>;
  create(data: Prisma.TransitRouteCreateInput): Promise<TransitRoute>;
  update(id: string, data: Prisma.TransitRouteUpdateInput): Promise<TransitRoute>;
  delete(id: string): Promise<void>;
}

export const TRANSIT_ROUTE_REPOSITORY = Symbol.for('ITransitRouteRepository');
