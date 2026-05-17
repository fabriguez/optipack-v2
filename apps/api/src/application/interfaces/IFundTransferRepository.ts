import type { FundTransfer, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface IFundTransferRepository {
  findById(id: string): Promise<FundTransfer | null>;
  findAll(
    filters: {
      sourceAgencyId?: string;
      sourceOrganizationId?: string;
      sourceType?: 'AGENCY' | 'HQ';
      destinationAgencyId?: string;
      agencyIds?: string[];
      reference?: string;
      status?: 'PENDING' | 'CONFIRMED' | 'VOIDED';
      dateFrom?: string;
      dateTo?: string;
      sourcePaymentMethod?: string;
      destinationPaymentMethod?: string;
      minAmount?: number;
      maxAmount?: number;
    },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<FundTransfer>>;
  create(data: Prisma.FundTransferCreateInput): Promise<FundTransfer>;
  update(id: string, data: Prisma.FundTransferUpdateInput): Promise<FundTransfer>;
}

export const FUND_TRANSFER_REPOSITORY = Symbol.for('IFundTransferRepository');
