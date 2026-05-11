import { injectable } from 'tsyringe';
import type { Payment, Prisma } from '@prisma/client';
import type { IPaymentRepository, PaymentWithRelations } from '../../../application/interfaces/IPaymentRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

const PAYMENT_INCLUDE = {
  // On expose les colis lies a la facture (pour la colonne "Ref colis" de
  // la liste) + le colis specifique du paiement s'il est scope. attachments
  // sert au detail + a la mini-preview de la liste.
  invoice: {
    select: {
      id: true,
      reference: true,
      clientId: true,
      client: { select: { id: true, fullName: true, phone: true } },
      parcels: { select: { id: true, trackingNumber: true, designation: true } },
    },
  },
  parcel: { select: { id: true, trackingNumber: true, designation: true } },
  agency: { select: { id: true, name: true, code: true } },
  receivedBy: { select: { id: true, firstName: true, lastName: true } },
  attachments: {
    select: { id: true, url: true, key: true, kind: true, caption: true, createdAt: true },
  },
};

@injectable()
export class PrismaPaymentRepository implements IPaymentRepository {
  async findById(id: string): Promise<PaymentWithRelations | null> {
    return prisma.payment.findUnique({
      where: { id },
      include: PAYMENT_INCLUDE,
    }) as Promise<PaymentWithRelations | null>;
  }

  async findByInvoice(invoiceId: string): Promise<Payment[]> {
    return prisma.payment.findMany({
      where: { invoiceId, isVoided: false },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAll(
    filters: { agencyId?: string; agencyIds?: string[] },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<PaymentWithRelations>> {
    const { page, limit, search } = pagination;
    const skip = (page - 1) * limit;

    // Recherche elargie : ref paiement, ref facture, nom/tel client de la
    // facture, tracking d'un colis lie (direct via parcel ou indirect via
    // invoice.parcels). Permet a la barre de recherche du module Paiements
    // de retrouver une transaction depuis n'importe quel angle.
    const where: Prisma.PaymentWhereInput = {
      ...(filters.agencyId && { agencyId: filters.agencyId }),
      ...(filters.agencyIds?.length && { agencyId: { in: filters.agencyIds } }),
      ...(search && {
        OR: [
          { reference: { contains: search, mode: 'insensitive' } },
          { transactionReference: { contains: search, mode: 'insensitive' } },
          { invoice: { reference: { contains: search, mode: 'insensitive' } } },
          { invoice: { client: { fullName: { contains: search, mode: 'insensitive' } } } },
          { invoice: { client: { phone: { contains: search, mode: 'insensitive' } } } },
          { parcel: { trackingNumber: { contains: search, mode: 'insensitive' } } },
          { invoice: { parcels: { some: { trackingNumber: { contains: search, mode: 'insensitive' } } } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: PAYMENT_INCLUDE,
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      data: data as PaymentWithRelations[],
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async create(data: Prisma.PaymentCreateInput): Promise<Payment> {
    return prisma.payment.create({ data });
  }

  // PAS de update generique -- immutable
  async void(id: string, reason: string, voidedByUserId: string): Promise<Payment> {
    return prisma.payment.update({
      where: { id },
      data: {
        isVoided: true,
        voidedAt: new Date(),
        voidReason: reason,
        voidedBy: { connect: { id: voidedByUserId } },
      },
    });
  }

  async sumByAgencyAndDate(agencyId: string, date: Date): Promise<number> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await prisma.payment.aggregate({
      where: {
        agencyId,
        isVoided: false,
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      _sum: { amount: true },
    });

    return Number(result._sum.amount || 0);
  }
}
