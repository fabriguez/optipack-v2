import { inject, injectable } from 'tsyringe';
import { generateReference } from '@transitsoftservices/shared';
import { PAYMENT_REPOSITORY, type IPaymentRepository } from '../../interfaces/IPaymentRepository';
import { INVOICE_REPOSITORY, type IInvoiceRepository } from '../../interfaces/IInvoiceRepository';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { JOURNAL_ENTRY_REPOSITORY, type IJournalEntryRepository } from '../../interfaces/IJournalEntryRepository';
import { NotFoundError, ImmutabilityError, BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';

@injectable()
export class VoidPaymentUseCase {
  constructor(
    @inject(PAYMENT_REPOSITORY) private paymentRepo: IPaymentRepository,
    @inject(INVOICE_REPOSITORY) private invoiceRepo: IInvoiceRepository,
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
    @inject(JOURNAL_ENTRY_REPOSITORY) private journalRepo: IJournalEntryRepository,
  ) {}

  async execute(paymentId: string, reason: string, userId: string) {
    const payment = await this.paymentRepo.findById(paymentId);
    if (!payment) throw new NotFoundError('Paiement', paymentId);

    if (payment.isVoided) {
      throw new BusinessError('Ce paiement est deja annule');
    }

    // Void the payment (no delete, no modify amount)
    await this.paymentRepo.void(paymentId, reason, userId);

    // Reverse invoice amounts
    const invoice = await this.invoiceRepo.findById(payment.invoiceId);
    if (invoice) {
      const newPaidAmount = Math.max(0, Number(invoice.paidAmount) - Number(payment.amount));
      const newBalance = Number(invoice.netAmount) - newPaidAmount;
      const newStatus = newPaidAmount <= 0 ? 'UNPAID' : 'PARTIAL';

      await this.invoiceRepo.update(invoice.id, {
        paidAmount: newPaidAmount,
        balance: newBalance,
        status: newStatus,
      });
    }

    // Reverse cash register
    const cashRegister = await this.cashRegisterRepo.findOrCreateForToday(payment.agencyId);
    await this.cashRegisterRepo.addExit(cashRegister.id, Number(payment.amount));

    // Create REVERSE journal entry
    const journalCount = await this.journalRepo.countByDate(payment.agencyId, new Date());
    const journalRef = generateReference('JRN', journalCount + 1);

    await this.journalRepo.create({
      reference: journalRef,
      description: `Annulation paiement ${payment.reference} - Motif: ${reason}`,
      sourceType: 'PAYMENT',
      sourceId: paymentId,
      agency: { connect: { id: payment.agencyId } },
      createdBy: { connect: { id: userId } },
      lines: {
        create: [
          {
            debitAccount: { connect: { code: '301000' } },  // Creances clients (re-debit)
            debitAmount: Number(payment.amount),
            creditAmount: 0,
            description: `Annulation encaissement ${payment.reference}`,
          },
          {
            creditAccount: { connect: { code: '101000' } }, // Caisse (re-credit)
            debitAmount: 0,
            creditAmount: Number(payment.amount),
            description: `Sortie caisse - annulation ${payment.reference}`,
          },
        ],
      },
    });

    eventBus.emit({
      type: DomainEvents.PAYMENT_VOIDED,
      payload: { paymentId, amount: Number(payment.amount), reason, agencyId: payment.agencyId },
      timestamp: new Date(),
      userId,
    });

    return { paymentId, voided: true, reason };
  }
}
