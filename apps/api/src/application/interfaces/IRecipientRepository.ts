import type { Recipient, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface IRecipientRepository {
  findById(id: string): Promise<Recipient | null>;
  findByAgency(
    agencyId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Recipient>>;
  findAll(
    filters: { agencyIds?: string[] },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Recipient>>;
  create(data: Prisma.RecipientCreateInput): Promise<Recipient>;
  update(id: string, data: Prisma.RecipientUpdateInput): Promise<Recipient>;
  delete(id: string): Promise<void>;
}

export const RECIPIENT_REPOSITORY = Symbol.for('IRecipientRepository');
