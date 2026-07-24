import { injectable } from 'tsyringe';
import type { AdjustDebtInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';
import { assertAgencyActive } from '../../services/scope/agencyScope';

/**
 * Ajuste le montant total et/ou l'echeance d'une dette. Reserve admin.
 * Garantit que newTotalAmount >= paidAmount (impossible de descendre sous
 * ce qui a deja ete paye). Tout changement est trace dans DebtHistory.
 */
@injectable()
export class AdjustDebtUseCase {
  async execute(debtId: string, input: AdjustDebtInput, userId: string) {
    const debt = await prisma.debt.findUnique({ where: { id: debtId } });
    if (!debt) throw new NotFoundError('Dette', debtId);
    if (debt.status === 'CANCELLED') {
      throw new BusinessError("Dette annulee : ajustement impossible.");
    }
    const paid = Number(debt.paidAmount);
    if (input.newTotalAmount < paid) {
      throw new BusinessError(
        `Le nouveau montant (${input.newTotalAmount}) est inferieur au montant deja paye (${paid}).`,
      );
    }

    // Agence de rattachement desactivee : ajustement gele (409). agencyId
    // absent (dette non rattachee a une agence) -> pas de verrou.
    if (debt.agencyId) await assertAgencyActive(debt.agencyId);

    const newRemaining = Math.max(0, input.newTotalAmount - paid);
    const newStatus = newRemaining <= 0 ? 'CLEARED' : paid > 0 ? 'PARTIALLY_PAID' : 'ACTIVE';

    return prisma.$transaction(async (tx) => {
      const updated = await tx.debt.update({
        where: { id: debtId },
        data: {
          totalAmount: input.newTotalAmount,
          remainingAmount: newRemaining,
          status: newStatus,
          isCleared: newRemaining <= 0,
          ...(input.newDueDateFinal !== undefined && {
            dueDateFinal: input.newDueDateFinal ? new Date(input.newDueDateFinal) : null,
          }),
          ...(input.newNextDueDate !== undefined && {
            nextDueDate: input.newNextDueDate ? new Date(input.newNextDueDate) : null,
          }),
        },
      });

      await tx.debtHistory.create({
        data: {
          debtId,
          action: 'ADJUSTED',
          changes: {
            totalAmountBefore: Number(debt.totalAmount),
            totalAmountAfter: input.newTotalAmount,
            remainingBefore: Number(debt.remainingAmount),
            remainingAfter: newRemaining,
            statusBefore: debt.status,
            statusAfter: newStatus,
            dueDateFinalBefore: debt.dueDateFinal,
            dueDateFinalAfter: input.newDueDateFinal ?? debt.dueDateFinal,
            nextDueDateBefore: debt.nextDueDate,
            nextDueDateAfter: input.newNextDueDate ?? debt.nextDueDate,
          },
          comment: input.reason,
          userId,
        },
      });

      return updated;
    });
  }
}
