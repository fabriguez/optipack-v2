import { inject, injectable } from 'tsyringe';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { WAREHOUSE_REPOSITORY, type IWarehouseRepository } from '../../interfaces/IWarehouseRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';

interface UnloadResult {
  parcelId: string;
  status: 'received' | 'not_found' | 'modified';
  newWeight?: number;
  comment?: string;
}

// Audit fix #3 : statuts conteneur reduits a 5. Le dechargement n'est possible
// qu'en RECEIVED (le conteneur est arrive). Quand tous les colis sont decharges,
// le conteneur passe automatiquement a UNLOADED (terminal, plus reutilisable).
const UNLOAD_ALLOWED_STATUSES = new Set(['RECEIVED']);

@injectable()
export class UnloadParcelUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    @inject(WAREHOUSE_REPOSITORY) private warehouseRepo: IWarehouseRepository,
    private history: HistoryService,
  ) {}

  async execute(
    containerId: string,
    parcelId: string,
    action: 'received' | 'not_found' | 'modified',
    warehouseId: string,
    userId: string,
    options?: { newWeight?: number; comment?: string },
  ): Promise<UnloadResult> {
    const container = await this.containerRepo.findById(containerId);
    if (!container) throw new NotFoundError('Conteneur', containerId);

    if (!UNLOAD_ALLOWED_STATUSES.has(container.status)) {
      throw new BusinessError(
        `Conteneur ne peut pas etre decharge au statut ${container.status}. Le conteneur doit etre arrive.`,
      );
    }

    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new NotFoundError('Colis', parcelId);

    if (parcel.containerId !== containerId) {
      throw new BusinessError('Ce colis ne fait pas partie de ce conteneur');
    }

    const warehouse = await this.warehouseRepo.findById(warehouseId);
    if (!warehouse) throw new NotFoundError('Magasin', warehouseId);

    // Le conteneur reste en RECEIVED tant qu'il y a des colis dedans.
    // Pas d'etat intermediaire UNLOADING (audit fix #3).

    switch (action) {
      case 'received':
        await this.parcelRepo.update(parcelId, {
          status: 'RECEIVED',
          warehouse: { connect: { id: warehouseId } },
          container: { disconnect: true },
          isPresent: true,
        });
        break;

      case 'not_found':
        await this.parcelRepo.update(parcelId, {
          status: 'LOST',
          isPresent: false,
          container: { disconnect: true },
        });
        break;

      case 'modified':
        await this.parcelRepo.update(parcelId, {
          status: 'RECEIVED',
          warehouse: { connect: { id: warehouseId } },
          container: { disconnect: true },
          isPresent: true,
          ...(options?.newWeight && { weight: options.newWeight }),
          ...(options?.comment && { observation: options.comment }),
        });
        break;
    }

    const parcelWeight = parcel.weight ? Number(parcel.weight) : 0;
    const newLoad = Math.max(0, Number(container.currentLoad) - parcelWeight);

    // Apres dechargement : si plus aucun colis dans le conteneur, on passe en UNLOADED (terminal).
    const remaining = await this.parcelRepo.findByContainer(containerId);
    const isLastParcel = remaining.length === 0;

    await this.containerRepo.update(containerId, {
      currentLoad: newLoad,
      ...(isLastParcel && { status: 'UNLOADED' }),
    });

    // Trace par colis dans l'historique du conteneur (chaque dechargement).
    await this.history.recordContainer({
      containerId,
      action: `PARCEL_UNLOADED_${action.toUpperCase()}`,
      statusBefore: container.status,
      statusAfter: container.status,
      userId,
      comment: `Colis ${parcel.trackingNumber} - ${parcel.designation}${options?.comment ? ` (${options.comment})` : ''}`,
      changes: {
        parcelId,
        trackingNumber: parcel.trackingNumber,
        designation: parcel.designation,
        action,
        warehouseId: action === 'not_found' ? null : warehouseId,
        ...(options?.newWeight && { newWeight: options.newWeight, previousWeight: parcelWeight }),
      },
    });

    if (isLastParcel) {
      await this.history.recordContainer({
        containerId,
        action: 'UNLOADED',
        statusBefore: 'RECEIVED',
        statusAfter: 'UNLOADED',
        userId,
        comment: 'Tous les colis ont ete decharges. Conteneur cloture.',
      });
    }

    await this.history.recordParcel({
      parcelId,
      action: `UNLOADED_${action.toUpperCase()}`,
      statusBefore: parcel.status,
      statusAfter: action === 'not_found' ? 'LOST' : 'RECEIVED',
      isPresentAfter: action !== 'not_found',
      containerId,
      warehouseId: action === 'not_found' ? null : warehouseId,
      userId,
      comment: options?.comment ?? null,
      parcelDesignationSnapshot: parcel.designation,
      parcelTrackingSnapshot: parcel.trackingNumber,
      metadata: options?.newWeight ? { newWeight: options.newWeight, previousWeight: parcelWeight } : null,
    });

    return {
      parcelId,
      status: action,
      newWeight: options?.newWeight,
      comment: options?.comment,
    };
  }
}
