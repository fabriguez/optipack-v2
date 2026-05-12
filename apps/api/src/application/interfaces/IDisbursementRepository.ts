import type { DisbursementVoucher, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface IDisbursementRepository {
  findById(id: string): Promise<DisbursementVoucher | null>;
  findAll(
    filters: {
      agencyId?: string;
      agencyIds?: string[];
      ordererUserId?: string;
      dateFrom?: string;
      dateTo?: string;
      containerId?: string;
      parcelId?: string;
      clientId?: string;
    },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<DisbursementVoucher>>;
  create(data: Prisma.DisbursementVoucherCreateInput): Promise<DisbursementVoucher>;
  void(id: string, reason: string, reverseEntryId: string): Promise<DisbursementVoucher>;
}

export const DISBURSEMENT_REPOSITORY = Symbol.for('IDisbursementRepository');
