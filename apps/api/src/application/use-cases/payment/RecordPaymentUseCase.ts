import { inject, injectable } from 'tsyringe';
import type { RecordPaymentInput } from '@optipack/shared';
import { generateReference } from '@optipack/shared';
import { PAYMENT_REPOSITORY, type IPaymentRepository } from '../../interfaces/IPaymentRepository';
import { INVOICE_REPOSITORY, type IInvoiceRepository } from '../../interfaces/IInvoiceRepository';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { JOURNAL_ENTRY_REPOSITORY, type IJournalEntryRepository } from '../../interfaces/IJournalEntryRepository';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';

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

    // 8. Emit event
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
