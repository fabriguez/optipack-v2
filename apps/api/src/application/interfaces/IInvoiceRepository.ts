import type { Invoice, Prisma } from '@prisma/client';

export interface IInvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  findByReference(reference: string): Promise<Invoice | null>;
  create(data: Prisma.InvoiceCreateInput): Promise<Invoice>;
  update(id: string, data: Prisma.InvoiceUpdateInput): Promise<Invoice>;
  countByDate(agencyId: string, date: Date): Promise<number>;
}

export const INVOICE_REPOSITORY = Symbol.for('IInvoiceRepository');
