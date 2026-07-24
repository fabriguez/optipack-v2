import { injectable } from 'tsyringe';
import type { VoidDebtInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';
import { assertAgencyActive } from '../../services/scope/agencyScope';

/**
 * Annule une dette (status = CANCELLED). Reserve admin (controle au niveau
 * de la route). Ne supprime pas la ligne -- l'historique reste consultable.
 * Refuse l'annulation si des paiements non annules existent : il faut
 * d'abord les invalider (VoidDebtPaymentUseCase, Phase 2).
 */
@injectable()
export class VoidDebtUseCase {
  async execute(debtId: string, input: VoidDebtInput, userId: string) {
    const debt = await prisma.debt.findUnique({
      where: { id: debtId },
      include: {
        payments: { where: { isVoided: false }, select: { id: true } },
      },
    });
    if (!debt) throw new NotFoundError('Dette', debtId);
    if (debt.status === 'CANCELLED') {
      throw new BusinessError('Dette deja annulee.');
    }
    if (debt.payments.length > 0) {
      throw new BusinessError(
        `Impossible d'annuler : ${debt.payments.length} paiement(s) non annule(s) sont rattaches a cette dette.`,
      );
    }

    // Agence de rattachement desactivee : annulation gelee (409). agencyId
    // absent (dette non rattachee a une agence) -> pas de verrou.
    if (debt.agencyId) await assertAgencyActive(debt.agencyId);

    return prisma.$transaction(async (tx) => {
      const updated = await tx.debt.update({
        where: { id: debtId },
        data: {
          status: 'CANCELLED',
          voidedAt: new Date(),
          voidReason: input.reason,
          voidedByUserId: userId,
        },
      });

      await tx.debtHistory.create({
        data: {
          debtId,
          action: 'CANCELLED',
          changes: { statusBefore: debt.status, statusAfter: 'CANCELLED' },
          comment: input.reason,
          userId,
        },
      });

      return updated;
    });
  }
}
