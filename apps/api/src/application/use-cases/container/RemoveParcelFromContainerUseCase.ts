import { inject, injectable } from 'tsyringe';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';
import { assertAgencyActive } from '../../services/scope/agencyScope';
import { prisma } from '../../../config/database';

/**
 * Retrait d'un colis charge par erreur.
 * Autorise uniquement tant que le conteneur est au statut LOADING (avant depart).
 * Apres IN_TRANSIT/RECEIVED, le retrait passe par UnloadParcelUseCase.
 *
 * Le colis revient dans son magasin d'origine (originalWarehouseId si dispo,
 * sinon warehouseId precedent), avec status=IN_STOCK et isPresent=true.
 * Toute action est tracee via HistoryService (audit immuable).
 */
@injectable()
export class RemoveParcelFromContainerUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    private history: HistoryService,
  ) {}

  async execute(containerId: string, parcelId: string, reason: string, userId: string) {
    const container = await this.containerRepo.findById(containerId);
    if (!container) throw new NotFoundError('Conteneur', containerId);

    if (container.status !== 'LOADING') {
      throw new BusinessError(
        `Retrait impossible : le conteneur est au statut ${container.status}. Le retrait n'est autorise que pendant le chargement (LOADING). Apres depart, utilisez le dechargement.`,
      );
    }

    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new NotFoundError('Colis', parcelId);

    if (parcel.containerId !== containerId) {
      throw new BusinessError("Le colis n'appartient pas a ce conteneur.");
    }

    const targetWarehouseId = parcel.originalWarehouseId ?? parcel.warehouseId ?? null;
    if (!targetWarehouseId) {
      throw new BusinessError(
        "Impossible de determiner le magasin de retour pour ce colis (aucun magasin d'origine).",
      );
    }

    // Agence ou le colis atterrit : celle du magasin de retour ; a defaut,
    // l'agence d'arrivee/depart du conteneur. Bloque le retrait si desactivee.
    const targetWarehouse = await prisma.warehouse.findUnique({
      where: { id: targetWarehouseId },
      select: { agencyId: true },
    });
    const landingAgencyId =
      targetWarehouse?.agencyId ??
      container.arrivalAgencyId ??
      container.departureAgencyId ??
      null;
    if (landingAgencyId) {
      await assertAgencyActive(landingAgencyId);
    }

    await this.parcelRepo.update(parcelId, {
      status: 'IN_STOCK',
      container: { disconnect: true },
      warehouse: { connect: { id: targetWarehouseId } },
      isPresent: true,
    });

    // Recalcul currentLoad (on retire le poids du colis)
    const parcelWeight = parcel.weight ? Number(parcel.weight) : 0;
    const newLoad = Math.max(0, Number(container.currentLoad) - parcelWeight);
    await this.containerRepo.update(containerId, { currentLoad: newLoad });

    await this.history.recordParcel({
      parcelId,
      action: 'REMOVED_FROM_CONTAINER',
      statusBefore: 'LOADING',
      statusAfter: 'IN_STOCK',
      containerId,
      warehouseId: targetWarehouseId,
      userId,
      parcelDesignationSnapshot: parcel.designation,
      parcelTrackingSnapshot: parcel.trackingNumber,
      comment: `Retire de ${container.designation} : ${reason}`,
    });

    await this.history.recordContainer({
      containerId,
      action: 'PARCEL_REMOVED',
      statusBefore: container.status,
      statusAfter: container.status,
      userId,
      comment: `Retrait colis ${parcel.trackingNumber} : ${reason}`,
      changes: {
        parcelId,
        trackingNumber: parcel.trackingNumber,
        reason,
        newLoad,
      },
    });

    return { success: true, newLoad };
  }
}
