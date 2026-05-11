import { injectable } from 'tsyringe';
import type { MarkDebtLitigatedInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

/**
 * Bascule une dette en statut LITIGATED. Empeche les relances automatiques
 * (a brancher Phase 2). Le passage retour vers ACTIVE necessite admin et
 * passe par AdjustDebtUseCase (ou un futur UnmarkLitigatedUseCase).
 */
@injectable()
export class MarkDebtLitigatedUseCase {
  async execute(debtId: string, input: MarkDebtLitigatedInput, userId: string) {
    const debt = await prisma.debt.findUnique({ where: { id: debtId } });
    if (!debt) throw new NotFoundError('Dette', debtId);
    if (['CANCELLED', 'CLEARED'].includes(debt.status)) {
      throw new BusinessError(`Statut ${debt.status} : litige non applicable.`);
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.debt.update({
        where: { id: debtId },
        data: { status: 'LITIGATED' },
      });
      await tx.debtHistory.create({
        data: {
          debtId,
          action: 'STATUS_CHANGED',
          changes: { statusBefore: debt.status, statusAfter: 'LITIGATED' },
          comment: input.reason,
          userId,
        },
      });
      return updated;
    });
  }
}
