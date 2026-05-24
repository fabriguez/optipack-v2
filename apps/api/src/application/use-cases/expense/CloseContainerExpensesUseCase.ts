import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

/**
 * Cloture les depenses d'un conteneur :
 *  - Refus si tous les colis ne sont pas decharges (parcels avec containerId
 *    pointant encore sur ce conteneur).
 *  - Set expensesClosedAt + expensesClosedByUserId.
 *  - Apres cloture : aucune depense manuelle ne peut etre ajoutee/modifiee.
 *    Exception : propagation auto depuis un forwarding bypass ce verrou
 *    (cas precis ou le forwarding ajoute une depense apres cloture parent).
 *  - Irreversible : pas de decloture possible.
 */
@injectable()
export class CloseContainerExpensesUseCase {
  async execute(containerId: string, userId: string) {
    const container = await prisma.container.findUnique({
      where: { id: containerId },
      select: {
        id: true,
        designation: true,
        expensesClosedAt: true,
        _count: {
          select: { parcels: true },
        },
      },
    });
    if (!container) throw new NotFoundError('Conteneur', containerId);
    if (container.expensesClosedAt) {
      throw new BusinessError('Les depenses de ce conteneur sont deja cloturees.');
    }
    if (container._count.parcels > 0) {
      throw new BusinessError(
        `Cloture impossible : ${container._count.parcels} colis encore present(s) dans le conteneur. Dechargez-les d'abord.`,
      );
    }

    return prisma.container.update({
      where: { id: containerId },
      data: {
        expensesClosedAt: new Date(),
        expensesClosedByUserId: userId,
      },
    });
  }
}
