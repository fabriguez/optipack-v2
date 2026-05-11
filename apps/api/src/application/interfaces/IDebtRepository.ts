import type { Debt, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface IDebtRepository {
  findById(id: string): Promise<Debt | null>;
  findByClient(clientId: string): Promise<Debt[]>;
  findAll(
    filters: {
      clientId?: string;
      employeeId?: string;
      carrierId?: string;
      agencyId?: string;
      type?: string;
      status?: string;
      bucket?: 'client' | 'company';
    },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Debt>>;
  findOverdue(): Promise<Debt[]>;
  create(data: Prisma.DebtCreateInput): Promise<Debt>;
  update(id: string, data: Prisma.DebtUpdateInput): Promise<Debt>;
}

export const DEBT_REPOSITORY = Symbol.for('IDebtRepository');
