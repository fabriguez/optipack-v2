import type { FundTransfer, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface IFundTransferRepository {
  findById(id: string): Promise<FundTransfer | null>;
  findAll(
    filters: { sourceAgencyId?: string; agencyIds?: string[] },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<FundTransfer>>;
  create(data: Prisma.FundTransferCreateInput): Promise<FundTransfer>;
  update(id: string, data: Prisma.FundTransferUpdateInput): Promise<FundTransfer>;
}

export const FUND_TRANSFER_REPOSITORY = Symbol.for('IFundTransferRepository');
