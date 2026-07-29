import { inject, injectable } from 'tsyringe';
import type { RecordDebtPaymentInput } from '@transitsoftservices/shared';
import { generateReference } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { BusinessError, InsufficientBalanceError, NotFoundError } from '../../../domain/errors/BusinessError';
import { assertAgencyActive } from '../../services/scope/agencyScope';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { JOURNAL_ENTRY_REPOSITORY, type IJournalEntryRepository } from '../../interfaces/IJournalEntryRepository';
import { AccountingAccountService } from '../../services/AccountingAccountService';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';

/**
 * Enregistre un paiement de dette (jamais de modification directe du Debt).
 *
 *  - Cree une ligne DebtPayment immutable avec reference unique.
 *  - Recalcule paidAmount + remainingAmount sur Debt.
 *  - Bascule status -> PARTIALLY_PAID / CLEARED selon le solde.
 *  - Impacte la caisse du jour de l'agence : dette CLIENT = encaissement
 *    (entree caisse), dettes EMPLOYEE/AGENCY/CARRIER = la societe paye
 *    (sortie caisse, solde verifie avant).
 *  - Poste l'ecriture au journal (partie double) :
 *      CLIENT   : debit 101000 Caisse / credit 301000 Creances clients
 *      autres   : debit 401000 Dettes fournisseurs / credit 101000 Caisse
 *  - Emet DEBT_PAYMENT_RECEIVED (notification client + regen rapport jour).
 *  - Ecrit dans DebtHistory pour audit.
 */
@injectable()
export class RecordDebtPaymentUseCase {
  constructor(
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
    @inject(JOURNAL_ENTRY_REPOSITORY) private journalRepo: IJournalEntryRepository,
    private accountingAccounts: AccountingAccountService,
  ) {}

  async execute(debtId: string, input: RecordDebtPaymentInput, userId: string) {
    const debt = await prisma.debt.findUnique({
      where: { id: debtId },
      include: { agency: { select: { name: true } } },
    });
    if (!debt) throw new NotFoundError('Dette', debtId);
    if (debt.status === 'CANCELLED') {
      throw new BusinessError('Dette annulee : aucun paiement possible.');
    }
    if (debt.status === 'CLEARED') {
      throw new BusinessError('Dette deja soldee.');
    }

    // Agence desactivee : aucun encaissement de dette possible.
    await assertAgencyActive(input.agencyId);

    const remaining = Number(debt.remainingAmount);
    if (input.amount > remaining + 0.01) {
      throw new BusinessError(
        `Le montant (${input.amount}) depasse le solde restant (${remaining}).`,
      );
    }

    // Garantit le plan comptable AVANT toute mutation : le posting au journal
    // (apres la transaction) connecte des AccountingAccount par code ; sans
    // plan comptable il planterait apres commit du paiement (etat partiel).
    await this.accountingAccounts.ensureCoreAccounts(debt.organizationId);

    // Caisse du jour de l'agence : creee si absente, pour que le paiement soit
    // toujours rattache a une caisse et que le solde bouge reellement.
    const cashRegister = await this.cashRegisterRepo.findOrCreateForToday(input.agencyId);

    // Dette non-CLIENT : c'est la societe qui paye -> sortie de caisse, le
    // solde disponible doit couvrir le montant (meme regle qu'un decaissement).
    const isCashIn = debt.type === 'CLIENT';
    if (!isCashIn) {
      const available = Number(cashRegister.currentBalance);
      if (input.amount > available) {
        throw new InsufficientBalanceError(input.amount, available);
      }
    }

    // Reference paiement unique (DPY-<seq>).
    const reference = generateReference('DPY', Date.now());

    const { payment, updated } = await prisma.$transaction(async (tx) => {
      const payment = await tx.debtPayment.create({
        data: {
          reference,
          debtId,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          proofUrl: input.proofUrl ?? null,
          proofKey: input.proofKey ?? null,
          transactionReference: input.transactionReference ?? null,
          comment: input.comment ?? null,
          receivedByUserId: userId,
          agencyId: input.agencyId,
          cashRegisterId: cashRegister.id,
        },
      });

      const newPaid = Number(debt.paidAmount) + input.amount;
      const newRemaining = Math.max(0, Number(debt.totalAmount) - newPaid);
      const newStatus = newRemaining <= 0 ? 'CLEARED' : 'PARTIALLY_PAID';

      const updated = await tx.debt.update({
        where: { id: debtId },
        data: {
          paidAmount: newPaid,
          remainingAmount: newRemaining,
          status: newStatus,
          isCleared: newRemaining <= 0,
        },
      });

      await tx.debtHistory.create({
        data: {
          debtId,
          action: 'PAYMENT_RECORDED',
          changes: {
            paymentId: payment.id,
            paymentReference: payment.reference,
            amount: input.amount,
            method: input.paymentMethod,
            paidAmountBefore: Number(debt.paidAmount),
            paidAmountAfter: newPaid,
            remainingAmountAfter: newRemaining,
            statusAfter: newStatus,
          },
          comment: input.comment ?? null,
          userId,
        },
      });

      return { payment, updated };
    });

    // Mouvement caisse : entree (dette client encaissee) ou sortie (la societe
    // regle sa dette). La vue "mouvements de caisse" liste deja les DebtPayment
    // dans le meme sens -- solde et mouvements sont desormais coherents.
    if (isCashIn) {
      await this.cashRegisterRepo.addEntry(cashRegister.id, input.amount);
    } else {
      await this.cashRegisterRepo.addExit(cashRegister.id, input.amount);
    }

    // Ecriture au journal (partie double), reference race-safe.
    await this.postJournal(debt, payment.id, reference, input.amount, input.agencyId, userId, isCashIn);

    // Notification + regen rapport journalier via l'event bus.
    eventBus.emit({
      type: DomainEvents.DEBT_PAYMENT_RECEIVED,
      payload: {
        debtId,
        paymentId: payment.id,
        debtRef: debt.reference,
        paymentRef: reference,
        debtType: debt.type,
        motif: debt.motif,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        remainingAmount: Number(updated.remainingAmount),
        debtStatus: updated.status,
        clientId: debt.clientId,
        agencyId: input.agencyId,
        organizationId: debt.organizationId,
        agencyName: debt.agency?.name ?? '',
      },
      timestamp: new Date(),
      userId,
    });

    return { payment, debt: updated };
  }

  /**
   * Poste l'ecriture au journal. Reference race-safe : maxDailySequence n'est
   * pas atomique -> retry sur P2002, suffix aleatoire en dernier recours
   * (meme pattern que RecordPaymentUseCase).
   */
  private async postJournal(
    debt: { reference: string; motif: string },
    paymentId: string,
    paymentRef: string,
    amount: number,
    agencyId: string,
    userId: string,
    isCashIn: boolean,
  ): Promise<void> {
    const journalLines = {
      create: isCashIn
        ? [
            {
              debitAccount: { connect: { code: '101000' } }, // Caisse
              debitAmount: amount,
              creditAmount: 0,
              description: `Encaissement dette ${paymentRef}`,
            },
            {
              creditAccount: { connect: { code: '301000' } }, // Creances clients
              debitAmount: 0,
              creditAmount: amount,
              description: `Reglement dette ${debt.reference}`,
            },
          ]
        : [
            {
              debitAccount: { connect: { code: '401000' } }, // Dettes fournisseurs
              debitAmount: amount,
              creditAmount: 0,
              description: `Reglement dette ${debt.reference} - ${debt.motif}`,
            },
            {
              creditAccount: { connect: { code: '101000' } }, // Caisse
              debitAmount: 0,
              creditAmount: amount,
              description: `Sortie caisse ${paymentRef}`,
            },
          ],
    };
    const baseData = {
      description: `Paiement dette ${paymentRef} - ${debt.reference}`,
      sourceType: 'DEBT_PAYMENT' as const,
      sourceId: paymentId,
      agency: { connect: { id: agencyId } },
      createdBy: { connect: { id: userId } },
      lines: journalLines,
    };

    let journalBase = await this.journalRepo.maxDailySequence('JRN', new Date());
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await this.journalRepo.create({
          reference: generateReference('JRN', journalBase + 1 + attempt),
          ...baseData,
        });
        return;
      } catch (err: unknown) {
        if ((err as { code?: string })?.code !== 'P2002') throw err;
        journalBase = await this.journalRepo.maxDailySequence('JRN', new Date());
      }
    }
    await this.journalRepo.create({
      reference: `${generateReference('JRN', journalBase + 1)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      ...baseData,
    });
  }
}
