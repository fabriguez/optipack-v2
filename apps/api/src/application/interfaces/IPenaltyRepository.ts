import type { Penalty, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';

export interface IPenaltyRepository {
  findById(id: string): Promise<Penalty | null>;
  findByParcel(parcelId: string): Promise<Penalty | null>;
  findAll(
    filters: { agencyId?: string; clientId?: string; isPaid?: boolean },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Penalty>>;
  findParcelsEligibleForPenalty(graceDays: number): Promise<{ parcelId: string; clientId: string; agencyId: string; arrivalDate: Date }[]>;
  create(data: Prisma.PenaltyCreateInput): Promise<Penalty>;
  update(id: string, data: Prisma.PenaltyUpdateInput): Promise<Penalty>;
}

export const PENALTY_REPOSITORY = Symbol.for('IPenaltyRepository');
