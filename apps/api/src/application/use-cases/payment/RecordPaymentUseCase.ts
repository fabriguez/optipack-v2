import { inject, injectable } from 'tsyringe';
import type { RecordPaymentInput } from '@transitsoftservices/shared';
import { generateReference } from '@transitsoftservices/shared';
import { PAYMENT_REPOSITORY, type IPaymentRepository } from '../../interfaces/IPaymentRepository';
import { INVOICE_REPOSITORY, type IInvoiceRepository } from '../../interfaces/IInvoiceRepository';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { JOURNAL_ENTRY_REPOSITORY, type IJournalEntryRepository } from '../../interfaces/IJournalEntryRepository';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { prisma } from '../../../config/database';

// Audit fix #12 : 1 point de fidelite par tranche de 1000 XAF payee.
const LOYALTY_POINTS_PER_XAF = 1 / 1000;
const LOYALTY_TIER_THRESHOLDS: Array<{ tier: 'STANDARD' | 'SILVER' | 'GOLD' | 'VIP'; minPoints: number }> = [
  { tier: 'VIP', minPoints: 5000 },
  { tier: 'GOLD', minPoints: 1500 },
  { tier: 'SILVER', minPoints: 500 },
  { tier: 'STANDARD', minPoints: 0 },
];

function tierFor(points: number): 'STANDARD' | 'SILVER' | 'GOLD' | 'VIP' {
  return LOYALTY_TIER_THRESHOLDS.find((t) => points >= t.minPoints)!.tier;
}

@injectable()
export class RecordPaymentUseCase {
  constructor(
    @inject(PAYMENT_REPOSITORY) private paymentRepo: IPaymentRepository,
    @inject(INVOICE_REPOSITORY) private invoiceRepo: IInvoiceRepository,
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
    @inject(JOURNAL_ENTRY_REPOSITORY) private journalRepo: IJournalEntryRepository,
  ) {}

  async execute(input: RecordPaymentInput, userId: string) {
    // 1. Validate invoice
    const invoice = await this.invoiceRepo.findById(input.invoiceId);
    if (!invoice) throw new NotFoundError('Facture', input.invoiceId);

    if (invoice.status === 'PAID') {
      throw new BusinessError('Cette facture est deja soldee');
    }

    if (invoice.status === 'CANCELLED') {
      throw new BusinessError('Cette facture est annulee');
    }

    // 2. Validate amount
    const balance = Number(invoice.balance);
    if (input.amount > balance) {
      throw new BusinessError(
        `Le montant (${input.amount}) depasse le solde restant (${balance})`,
      );
    }

    // 3. Generate reference
    const paymentCount = await this.paymentRepo.sumByAgencyAndDate(input.agencyId, new Date());
    const reference = generateReference('PAY', Math.floor(paymentCount) + 1);

    // 4. Create IMMUTABLE payment
    const payment = await this.paymentRepo.create({
      reference,
      amount: input.amount,
      discount: input.discount ?? 0,
      discountReason: input.discountReason ?? null,
      tva: input.tva ?? 0,
      paymentMethod: input.paymentMethod,
      transactionReference: input.transactionReference ?? null,
      invoice: { connect: { id: input.invoiceId } },
      agency: { connect: { id: input.agencyId } },
      receivedBy: { connect: { id: userId } },
    });

    // 5. Update invoice
    const newPaidAmount = Number(invoice.paidAmount) + input.amount;
    const newBalance = Number(invoice.netAmount) - newPaidAmount;
    const newStatus = newBalance <= 0 ? 'PAID' : 'PARTIAL';

    await this.invoiceRepo.update(invoice.id, {
      paidAmount: newPaidAmount,
      balance: Math.max(0, newBalance),
      status: newStatus,
    });

    // 6. Update cash register (auto)
    const cashRegister = await this.cashRegisterRepo.findOrCreateForToday(input.agencyId);
    await this.cashRegisterRepo.addEntry(cashRegister.id, input.amount);

    // 7. Create journal entry (double-entry bookkeeping)
    const journalCount = await this.journalRepo.countByDate(input.agencyId, new Date());
    const journalRef = generateReference('JRN', journalCount + 1);

    await this.journalRepo.create({
      reference: journalRef,
      description: `Paiement ${reference} - Facture ${invoice.reference}`,
      sourceType: 'PAYMENT',
      sourceId: payment.id,
      agency: { connect: { id: input.agencyId } },
      createdBy: { connect: { id: userId } },
      lines: {
        create: [
          {
            debitAccount: { connect: { code: '101000' } },  // Caisse
            debitAmount: input.amount,
            creditAmount: 0,
            description: `Encaissement ${reference}`,
          },
          {
            creditAccount: { connect: { code: '301000' } }, // Creances clients
            debitAmount: 0,
            creditAmount: input.amount,
            description: `Reglement facture ${invoice.reference}`,
          },
        ],
      },
    });

    // 8. Attribution loyalty points (audit fix #12)
    if (invoice.clientId) {
      const earnedPoints = Math.floor(input.amount * LOYALTY_POINTS_PER_XAF);
      if (earnedPoints > 0) {
        const client = await prisma.client.findUnique({
          where: { id: invoice.clientId },
          select: { loyaltyPoints: true, loyaltyTier: true, totalSpent: true },
        });
        if (client) {
          const newPoints = client.loyaltyPoints + earnedPoints;
          const newTier = tierFor(newPoints);
          const tierUpgraded = newTier !== client.loyaltyTier;
          await prisma.$transaction([
            prisma.client.update({
              where: { id: invoice.clientId },
              data: {
                loyaltyPoints: newPoints,
                loyaltyTier: newTier,
                totalSpent: { increment: input.amount },
              },
            }),
            prisma.loyaltyTransaction.create({
              data: {
                clientId: invoice.clientId,
                points: earnedPoints,
                type: 'EARN',
                source: `payment:${payment.id}`,
                description: `Paiement ${reference} - +${earnedPoints} pts${tierUpgraded ? ` (passage ${newTier})` : ''}`,
              },
            }),
          ]);
        }
      }
    }

    // 9. Emit event
    eventBus.emit({
      type: DomainEvents.PAYMENT_RECEIVED,
      payload: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        agencyId: input.agencyId,
        amount: input.amount,
        newInvoiceStatus: newStatus,
        clientId: invoice.clientId,
      },
      timestamp: new Date(),
      userId,
    });

    return {
      payment,
      invoiceStatus: newStatus,
      invoiceBalance: Math.max(0, newBalance),
    };
  }
}
