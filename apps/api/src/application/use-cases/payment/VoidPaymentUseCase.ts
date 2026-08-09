import { inject, injectable } from 'tsyringe';
import { generateReference } from '@transitsoftservices/shared';
import { PAYMENT_REPOSITORY, type IPaymentRepository } from '../../interfaces/IPaymentRepository';
import { INVOICE_REPOSITORY, type IInvoiceRepository } from '../../interfaces/IInvoiceRepository';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { JOURNAL_ENTRY_REPOSITORY, type IJournalEntryRepository } from '../../interfaces/IJournalEntryRepository';
import { NotFoundError, ImmutabilityError, BusinessError } from '../../../domain/errors/BusinessError';
import { assertAgencyActive } from '../../services/scope/agencyScope';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { PromoCodeService } from '../../services/promo/PromoCodeService';

/**
 * Fenetre d'annulation d'un paiement : 2 jours apres sa creation. Passe ce
 * delai le paiement est definitif (il faut passer par un avoir / une remise).
 */
export const PAYMENT_VOID_WINDOW_DAYS = 2;
const PAYMENT_VOID_WINDOW_MS = PAYMENT_VOID_WINDOW_DAYS * 24 * 60 * 60 * 1000;

@injectable()
export class VoidPaymentUseCase {
  constructor(
    @inject(PAYMENT_REPOSITORY) private paymentRepo: IPaymentRepository,
    @inject(INVOICE_REPOSITORY) private invoiceRepo: IInvoiceRepository,
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
    @inject(JOURNAL_ENTRY_REPOSITORY) private journalRepo: IJournalEntryRepository,
    private promoCodes: PromoCodeService,
  ) {}

  async execute(paymentId: string, reason: string, userId: string) {
    const payment = await this.paymentRepo.findById(paymentId);
    if (!payment) throw new NotFoundError('Paiement', paymentId);

    if (payment.isVoided) {
      throw new BusinessError('Ce paiement est deja annule');
    }

    // Fenetre de 2 jours apres creation. Au-dela, le paiement est fige :
    // l'encaissement est deja consolide en caisse et en comptabilite.
    const ageMs = Date.now() - new Date(payment.createdAt).getTime();
    if (ageMs > PAYMENT_VOID_WINDOW_MS) {
      throw new BusinessError(
        `Ce paiement ne peut plus etre annule : le delai de ${PAYMENT_VOID_WINDOW_DAYS} jours ` +
          `apres sa creation est depasse.`,
        409,
        'PAYMENT_VOID_WINDOW_EXPIRED',
      );
    }

    // Agence de rattachement desactivee : annulation gelee (409).
    await assertAgencyActive(payment.agencyId);

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

      // Le solde se rouvre : un code promo deja consomme redevient reserve, il
      // reste attache a la facture tant qu'elle n'est pas soldee.
      await this.promoCodes.syncForInvoice(invoice.id);

      if (newStatus !== invoice.status) {
        eventBus.emit({
          type: DomainEvents.INVOICE_STATUS_CHANGED,
          payload: {
            invoiceId: invoice.id,
            invoiceRef: invoice.reference,
            statusBefore: invoice.status,
            statusAfter: newStatus,
            balance: newBalance,
            clientId: invoice.clientId,
            agencyId: payment.agencyId,
          },
          timestamp: new Date(),
          userId,
        });
      }
    }

    // Reverse cash register
    const cashRegister = await this.cashRegisterRepo.findOrCreateForToday(payment.agencyId);
    await this.cashRegisterRepo.addExit(cashRegister.id, Number(payment.amount));

    // Create REVERSE journal entry
    const journalCount = await this.journalRepo.countByDate(payment.agencyId, new Date());
    const journalRef = generateReference('JRN', Date.now());

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
      payload: {
        paymentId,
        paymentRef: payment.reference,
        amount: Number(payment.amount),
        paymentMethod: payment.paymentMethod,
        reason,
        agencyId: payment.agencyId,
        invoiceId: payment.invoiceId,
        invoiceRef: invoice?.reference ?? null,
        clientId: invoice?.clientId ?? null,
        voidedByUserId: userId,
        paymentCreatedAt: payment.createdAt,
      },
      timestamp: new Date(),
      userId,
    });

    return { paymentId, voided: true, reason };
  }
}
