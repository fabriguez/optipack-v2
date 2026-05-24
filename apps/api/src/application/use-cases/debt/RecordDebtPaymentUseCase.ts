import { injectable } from 'tsyringe';
import type { RecordDebtPaymentInput } from '@transitsoftservices/shared';
import { generateReference } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

/**
 * Enregistre un paiement de dette (jamais de modification directe du Debt).
 *
 *  - Cree une ligne DebtPayment immutable avec reference unique.
 *  - Recalcule paidAmount + remainingAmount sur Debt.
 *  - Bascule status -> PARTIALLY_PAID / CLEARED selon le solde.
 *  - Lie le paiement a la caisse du jour de l'agence (cas dette CLIENT :
 *    augmente le solde caisse ; cas EMPLOYEE/AGENCY/CARRIER : payer
 *    apparait comme decaissement -- pour Phase 1 on n'impacte pas la caisse
 *    automatiquement, c'est a faire dans Phase 2 avec un DisbursementVoucher
 *    correle).
 *  - Ecrit dans DebtHistory pour audit.
 */
@injectable()
export class RecordDebtPaymentUseCase {
  async execute(debtId: string, input: RecordDebtPaymentInput, userId: string) {
    const debt = await prisma.debt.findUnique({ where: { id: debtId } });
    if (!debt) throw new NotFoundError('Dette', debtId);
    if (debt.status === 'CANCELLED') {
      throw new BusinessError('Dette annulee : aucun paiement possible.');
    }
    if (debt.status === 'CLEARED') {
      throw new BusinessError('Dette deja soldee.');
    }

    const remaining = Number(debt.remainingAmount);
    if (input.amount > remaining + 0.01) {
      throw new BusinessError(
        `Le montant (${input.amount}) depasse le solde restant (${remaining}).`,
      );
    }

    // Reference paiement unique (DPY-<seq>).
    const seq = await prisma.debtPayment.count({ where: { agencyId: input.agencyId } });
    const reference = generateReference('DPY', Date.now());

    // Caisse du jour de l'agence (peut etre null si la caisse n'existe pas
    // encore pour ce jour ; on ne bloque pas le paiement pour Phase 1).
    const cashRegister = await prisma.agencyCashRegister.findFirst({
      where: { agencyId: input.agencyId, closedAt: null },
      orderBy: { date: 'desc' },
    });

    return prisma.$transaction(async (tx) => {
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
          cashRegisterId: cashRegister?.id ?? null,
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

      return { payment, debt: updated };
    });
  }
}
