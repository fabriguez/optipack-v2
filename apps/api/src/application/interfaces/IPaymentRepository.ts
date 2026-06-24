import type { Payment, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface PaymentWithRelations extends Payment {
  invoice?: { id: string; reference: string; clientId: string };
  agency?: { id: string; name: string; code: string };
  receivedBy?: { id: string; firstName: string; lastName: string };
}

export interface IPaymentRepository {
  findById(id: string): Promise<PaymentWithRelations | null>;
  findByInvoice(invoiceId: string): Promise<Payment[]>;
  findAll(
    filters: { agencyId?: string; agencyIds?: string[]; scopeWhere?: object | null },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<PaymentWithRelations>>;
  create(data: Prisma.PaymentCreateInput): Promise<Payment>;
  // PAS de update/delete -- paiement immutable, void seulement
  void(id: string, reason: string, voidedByUserId: string): Promise<Payment>;
  sumByAgencyAndDate(agencyId: string, date: Date): Promise<number>;
  countByAgencyAndDate(agencyId: string, date: Date): Promise<number>;
  /** Max sequence des references PREFIX-YYYYMMDD-NNNN du jour (global, anti-collision). */
  maxDailySequence(prefix: string, date: Date): Promise<number>;
}

export const PAYMENT_REPOSITORY = Symbol.for('IPaymentRepository');
