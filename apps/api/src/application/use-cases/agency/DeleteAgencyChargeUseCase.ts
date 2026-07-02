import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

/**
 * "Suppression" d'une charge recurrente : on desactive (isActive=false) au lieu
 * de supprimer, car des Expenses immuables peuvent reference la charge.
 */
@injectable()
export class DeleteAgencyChargeUseCase {
  async execute(chargeId: string, organizationId: string) {
    const charge = await prisma.agencyCharge.findUnique({
      where: { id: chargeId },
      include: {
        _count: { select: { expenses: true } },
        agency: { select: { organizationId: true } },
      },
    });
    if (!charge || charge.agency.organizationId !== organizationId) {
      throw new NotFoundError('Charge', chargeId);
    }

    if ((charge as any).isAutoManaged) {
      throw new BusinessError(
        'La charge masse salariale auto-geree ne peut pas etre supprimee.',
      );
    }

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
