import { injectable } from 'tsyringe';
import type { Invoice, Prisma } from '@prisma/client';
import type { IInvoiceRepository } from '../../../application/interfaces/IInvoiceRepository';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaInvoiceRepository implements IInvoiceRepository {
  async findById(id: string): Promise<Invoice | null> {
    return prisma.invoice.findUnique({ where: { id } });
  }

  async findByReference(reference: string): Promise<Invoice | null> {
    return prisma.invoice.findUnique({ where: { reference } });
  }

  async create(data: Prisma.InvoiceCreateInput): Promise<Invoice> {
    return prisma.invoice.create({ data });
  }

  async update(id: string, data: Prisma.InvoiceUpdateInput): Promise<Invoice> {
    return prisma.invoice.update({ where: { id }, data });
  }

  async countByDate(agencyId: string, date: Date): Promise<number> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return prisma.invoice.count({
      where: {
        agencyId,
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
    });
  }
}
