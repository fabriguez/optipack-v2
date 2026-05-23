import { injectable, inject } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';

/**
 * Marque un colis d'un conteneur comme NON RECU physiquement : il etait
 * declare au bordereau d'envoi (present "virtuellement") mais absent a la
 * reception. On cree une ManifestDiscrepancy MISSING_PHYSICAL pour qu'il
 * apparaisse dans le bordereau de comparaison, et on passe le colis en LOST.
 *
 * Idempotent : si une discrepancy MISSING_PHYSICAL existe deja pour ce
 * couple conteneur/colis, on ne la recree pas.
 */
@injectable()
export class MarkParcelMissingUseCase {
  constructor(@inject(HistoryService) private history: HistoryService) {}

  async execute(containerId: string, parcelId: string, userId: string, comment?: string) {
    const container = await prisma.container.findUnique({ where: { id: containerId } });
    if (!container) throw new NotFoundError('Conteneur', containerId);

    const parcel = await prisma.parcel.findUnique({ where: { id: parcelId } });
    if (!parcel) throw new NotFoundError('Colis', parcelId);

    // Le colis doit appartenir (ou avoir appartenu) a ce conteneur.
    if (parcel.containerId !== containerId && parcel.lastContainerId !== containerId) {
      throw new BusinessError('Ce colis ne fait pas partie de ce conteneur.');
    }
    if (parcel.status === 'LOST') {
      throw new BusinessError('Ce colis est deja marque comme non recu / perdu.');
    }

    const existing = await prisma.manifestDiscrepancy.findFirst({
      where: { containerId, parcelId, type: 'MISSING_PHYSICAL' },
    });

    const result = await prisma.$transaction(async (tx) => {
      // Colis -> LOST, retire du conteneur courant, non present.
      await tx.parcel.update({
        where: { id: parcelId },
        data: {
          status: 'LOST',
          isPresent: false,
          ...(parcel.containerId === containerId && { container: { disconnect: true } }),
          // On conserve lastContainerId pour tracer la provenance.
          ...(parcel.lastContainerId !== containerId && { lastContainer: { connect: { id: containerId } } }),
        },
      });

      // Repercussion sur le conteneur : si le colis etait charge dedans, on
      // decremente currentLoad. Si plus aucun colis n'y reste, on cloture
      // (UNLOADED) -- sinon le bordereau de reception restait bloque tant
      // que le conteneur conservait son statut RECEIVED.
      if (parcel.containerId === containerId) {
        const parcelWeight = parcel.weight ? Number(parcel.weight) : 0;
        const remaining = await tx.parcel.count({ where: { containerId } });
        await tx.container.update({
          where: { id: containerId },
          data: {
            currentLoad: { decrement: parcelWeight },
            ...(remaining === 0 && container.status === 'RECEIVED' && { status: 'UNLOADED' }),
          },
        });
      }

      const discrepancy = existing
        ? existing
        : await tx.manifestDiscrepancy.create({
            data: {
              containerId,
              parcelId,
              type: 'MISSING_PHYSICAL',
              designation: parcel.designation,
              trackingNumber: parcel.trackingNumber,
              weight: parcel.weight,
              comment: comment?.trim() || 'Colis declare mais non recu physiquement',
              markedByUserId: userId,
            },
          });

      return discrepancy;
    });

    await this.history.recordParcel({
      parcelId,
      action: 'MARKED_MISSING',
      statusBefore: parcel.status,
      statusAfter: 'LOST',
      isPresentAfter: false,
      containerId,
      userId,
      parcelDesignationSnapshot: parcel.designation,
      parcelTrackingSnapshot: parcel.trackingNumber,
      comment: comment?.trim() || 'Colis marque non recu (manquant physique)',
      metadata: { containerId, discrepancyId: result.id },
    });

    return result;
  }
}
