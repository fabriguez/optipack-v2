import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

/**
 * "Suppression" d'une charge recurrente : on desactive (isActive=false) au lieu
 * de supprimer, car des Expenses immuables peuvent reference la charge.
 */
@injectable()
export class DeleteAgencyChargeUseCase {
  async execute(chargeId: string) {
    const charge = await prisma.agencyCharge.findUnique({
      where: { id: chargeId },
      include: { _count: { select: { expenses: true } } },
    });
    if (!charge) throw new NotFoundError('Charge', chargeId);

    if (charge._count.expenses > 0) {
      // Desactivation : preserve l'historique
      return prisma.agencyCharge.update({
        where: { id: chargeId },
        data: { isActive: false },
      });
    }
    // Aucun paiement : on peut supprimer
    return prisma.agencyCharge.delete({ where: { id: chargeId } });
  }
}
