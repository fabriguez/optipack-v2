import { injectable } from 'tsyringe';
import type { MarkDebtLitigatedInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';
import { assertAgencyActive } from '../../services/scope/agencyScope';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';

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

    // Agence de rattachement desactivee : bascule en litige gelee (409).
    // agencyId absent (dette non rattachee a une agence) -> pas de verrou.
    if (debt.agencyId) await assertAgencyActive(debt.agencyId);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.debt.update({
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
      return row;
    });

    eventBus.emit({
      type: DomainEvents.DEBT_STATUS_CHANGED,
      payload: {
        debtId,
        debtRef: updated.reference,
        statusBefore: debt.status,
        statusAfter: 'LITIGATED',
        reason: input.reason,
        remainingAmount: Number(updated.remainingAmount),
        clientId: updated.clientId,
        agencyId: updated.agencyId,
        organizationId: updated.organizationId,
      },
      timestamp: new Date(),
      userId,
    });

    return updated;
  }
}
