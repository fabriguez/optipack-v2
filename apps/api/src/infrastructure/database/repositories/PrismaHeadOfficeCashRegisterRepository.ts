import { injectable } from 'tsyringe';
import type { HeadOfficeCashRegister, Prisma } from '@prisma/client';
import type { IHeadOfficeCashRegisterRepository } from '../../../application/interfaces/IHeadOfficeCashRegisterRepository';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaHeadOfficeCashRegisterRepository implements IHeadOfficeCashRegisterRepository {
  async findById(id: string): Promise<HeadOfficeCashRegister | null> {
    return prisma.headOfficeCashRegister.findUnique({ where: { id } });
  }

  async findByOrganization(organizationId: string): Promise<HeadOfficeCashRegister | null> {
    return prisma.headOfficeCashRegister.findUnique({ where: { organizationId } });
  }

  async findOrCreate(organizationId: string): Promise<HeadOfficeCashRegister> {
    const existing = await prisma.headOfficeCashRegister.findUnique({ where: { organizationId } });
    if (existing) return existing;
    return prisma.headOfficeCashRegister.create({
      data: { organization: { connect: { id: organizationId } } },
    });
  }

  async addEntry(id: string, amount: number, tx?: Prisma.TransactionClient): Promise<HeadOfficeCashRegister> {
    const client = tx ?? prisma;
    return client.headOfficeCashRegister.update({
      where: { id },
      data: {
        totalEntries: { increment: amount },
        currentBalance: { increment: amount },
      },
    });
  }

  async addExit(id: string, amount: number, tx?: Prisma.TransactionClient): Promise<HeadOfficeCashRegister> {
    const client = tx ?? prisma;
    return client.headOfficeCashRegister.update({
      where: { id },
      data: {
        totalExits: { increment: amount },
        currentBalance: { decrement: amount },
      },
    });
  }
}
