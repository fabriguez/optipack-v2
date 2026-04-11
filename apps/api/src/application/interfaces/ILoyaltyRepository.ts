import type { LoyaltyTransaction, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';

export interface ILoyaltyRepository {
  findByClient(clientId: string, pagination: PaginationInput): Promise<PaginatedResponse<LoyaltyTransaction>>;
  create(data: Prisma.LoyaltyTransactionCreateInput): Promise<LoyaltyTransaction>;
  sumPointsByClient(clientId: string): Promise<number>;
}

export const LOYALTY_REPOSITORY = Symbol.for('ILoyaltyRepository');
