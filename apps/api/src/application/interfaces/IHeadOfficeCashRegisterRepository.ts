import type { HeadOfficeCashRegister, Prisma } from '@prisma/client';

export interface IHeadOfficeCashRegisterRepository {
  findById(id: string): Promise<HeadOfficeCashRegister | null>;
  findByOrganization(organizationId: string): Promise<HeadOfficeCashRegister | null>;
  findOrCreate(organizationId: string): Promise<HeadOfficeCashRegister>;
  addEntry(id: string, amount: number, tx?: Prisma.TransactionClient): Promise<HeadOfficeCashRegister>;
  addExit(id: string, amount: number, tx?: Prisma.TransactionClient): Promise<HeadOfficeCashRegister>;
}

export const HEAD_OFFICE_CASH_REGISTER_REPOSITORY = Symbol.for('IHeadOfficeCashRegisterRepository');
