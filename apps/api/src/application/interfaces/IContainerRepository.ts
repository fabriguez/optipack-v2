import type { Container, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface ContainerWithRelations extends Container {
  departureAgency?: { id: string; name: string; code: string };
  arrivalAgency?: { id: string; name: string; code: string };
  transitRoute?: { id: string; name: string; type: string } | null;
  parentContainer?: { id: string; designation: string; type: string; isForwarding: boolean } | null;
  childContainers?: { id: string; designation: string; type: string }[];
  _count?: { parcels: number; childContainers?: number };
}

export interface IContainerRepository {
  findById(id: string): Promise<ContainerWithRelations | null>;
  findAll(
    filters: {
      departureAgencyId?: string;
      arrivalAgencyId?: string;
      status?: string;
      isForwarding?: boolean;
      agencyIds?: string[];
    },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<ContainerWithRelations>>;
  create(data: Prisma.ContainerCreateInput): Promise<Container>;
  update(id: string, data: Prisma.ContainerUpdateInput): Promise<Container>;
  delete(id: string): Promise<void>;
}

export const CONTAINER_REPOSITORY = Symbol.for('IContainerRepository');
