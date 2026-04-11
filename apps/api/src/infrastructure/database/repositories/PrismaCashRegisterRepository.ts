import { injectable } from 'tsyringe';
import type { AgencyCashRegister, Prisma } from '@prisma/client';
import type { ICashRegisterRepository } from '../../../application/interfaces/ICashRegisterRepository';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaCashRegisterRepository implements ICashRegisterRepository {
  async findById(id: string): Promise<AgencyCashRegister | null> {
    return prisma.agencyCashRegister.findUnique({ where: { id } });
  }

  async findOpenByAgency(agencyId: string, date: Date): Promise<AgencyCashRegister | null> {
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    return prisma.agencyCashRegister.findUnique({
      where: { agencyId_date: { agencyId, date: dateOnly } },
    });
  }

  async findOrCreateForToday(agencyId: string): Promise<AgencyCashRegister> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await this.findOpenByAgency(agencyId, today);
    if (existing) return existing;

    // Get yesterday's closing balance as today's opening
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayRegister = await this.findOpenByAgency(agencyId, yesterday);
    const openingBalance = yesterdayRegister?.closingBalance ?? yesterdayRegister?.currentBalance ?? 0;

    return prisma.agencyCashRegister.create({
      data: {
        agency: { connect: { id: agencyId } },
        date: today,
        openingBalance: Number(openingBalance),
        currentBalance: Number(openingBalance),
      },
    });
  }

  async create(data: Prisma.AgencyCashRegisterCreateInput): Promise<AgencyCashRegister> {
    return prisma.agencyCashRegister.create({ data });
  }

  async update(id: string, data: Prisma.AgencyCashRegisterUpdateInput): Promise<AgencyCashRegister> {
    return prisma.agencyCashRegister.update({ where: { id }, data });
  }

  async addEntry(id: string, amount: number): Promise<AgencyCashRegister> {
    return prisma.agencyCashRegister.update({
      where: { id },
      data: {
        totalEntries: { increment: amount },
        currentBalance: { increment: amount },
      },
    });
  }

  async addExit(id: string, amount: number): Promise<AgencyCashRegister> {
    return prisma.agencyCashRegister.update({
      where: { id },
      data: {
        totalExits: { increment: amount },
        currentBalance: { decrement: amount },
      },
    });
  }
}
