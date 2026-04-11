import type { AgencyCashRegister, Prisma } from '@prisma/client';

export interface ICashRegisterRepository {
  findById(id: string): Promise<AgencyCashRegister | null>;
  findOpenByAgency(agencyId: string, date: Date): Promise<AgencyCashRegister | null>;
  findOrCreateForToday(agencyId: string): Promise<AgencyCashRegister>;
  create(data: Prisma.AgencyCashRegisterCreateInput): Promise<AgencyCashRegister>;
  update(id: string, data: Prisma.AgencyCashRegisterUpdateInput): Promise<AgencyCashRegister>;
  addEntry(id: string, amount: number): Promise<AgencyCashRegister>;
  addExit(id: string, amount: number): Promise<AgencyCashRegister>;
}

export const CASH_REGISTER_REPOSITORY = Symbol.for('ICashRegisterRepository');
