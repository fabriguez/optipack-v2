import type { Expense, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface IExpenseRepository {
  findById(id: string): Promise<Expense | null>;
  findAll(
    filters: { agencyId?: string; agencyIds?: string[] },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Expense>>;
  create(data: Prisma.ExpenseCreateInput): Promise<Expense>;
  update(id: string, data: Prisma.ExpenseUpdateInput): Promise<Expense>;
  delete(id: string): Promise<void>;
}

export const EXPENSE_REPOSITORY = Symbol.for('IExpenseRepository');
