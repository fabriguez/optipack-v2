import { inject, injectable } from 'tsyringe';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { HistoryService } from '../../services/HistoryService';

@injectable()
export class ArriveContainerUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    private history: HistoryService,
  ) {}

  async execute(containerId: string, userId: string) {
    const container = await this.containerRepo.findById(containerId);
    if (!container) throw new NotFoundError('Conteneur', containerId);

    if (container.status !== 'IN_TRANSIT') {
      throw new BusinessError(
        `Le conteneur doit etre en transit pour arriver. Statut actuel: ${container.status}`,
      );
    }

    const arrivalDate = new Date();
    await this.containerRepo.update(containerId, {
      status: 'RECEIVED',
      actualArrivalDate: arrivalDate,
    });

    const parcels = await this.parcelRepo.findByContainer(containerId);
    const parcelIds = parcels.map((p) => p.id);

    if (parcelIds.length > 0) {
      // Cote colis : ARRIVED (= dans le conteneur a destination, en attente de dechargement).
      // Quand le colis sera reellement decharge en magasin, il passera a RECEIVED.
      await this.parcelRepo.updateMany(parcelIds, {
        status: 'ARRIVED',
        arrivalDate,
        penaltyStartDate: arrivalDate,
      });

      await this.history.recordParcelMany(
        parcels.map((p) => ({
          parcelId: p.id,
          action: 'CONTAINER_ARRIVED',
          statusBefore: 'IN_TRANSIT',
          statusAfter: 'ARRIVED',
          containerId,
          userId,
          parcelDesignationSnapshot: p.designation,
          parcelTrackingSnapshot: p.trackingNumber,
          comment: `Arrivee du conteneur ${container.designation}`,
        })),
      );
    }

    await this.history.recordContainer({
      containerId,
      action: 'RECEIVED',
      statusBefore: 'IN_TRANSIT',
      statusAfter: 'RECEIVED',
      userId,
      comment: `Arrivee - ${parcelIds.length} colis a decharger`,
      changes: { arrivalDate: arrivalDate.toISOString(), parcelCount: parcelIds.length },
    });

    // Bordereau de reception : generation MANUELLE par l'utilisateur depuis
    // l'UI (decision metier : on attend que le dechargement soit complet ou
    // suffisant avant d'enregistrer). Plus de generation auto a l'arrivee.

    eventBus.emit({
      type: DomainEvents.CONTAINER_ARRIVED,
      payload: { containerId, parcelCount: parcelIds.length },
      timestamp: new Date(),
      userId,
    });

    // Emit parcel status change events for each parcel (IN_TRANSIT -> ARRIVED)
    try {
      for (const p of parcels) {
        try {
          eventBus.emit({
            type: DomainEvents.PARCEL_STATUS_CHANGED,
            payload: { parcelId: p.id, oldStatus: 'IN_TRANSIT', newStatus: 'ARRIVED', trackingNumber: p.trackingNumber },
            timestamp: new Date(),
            userId,
          });
        } catch (e) {
          // non blocking
        }
      }
    } catch (e) {
      // non blocking
    }

    return { containerId, parcelCount: parcelIds.length, status: 'RECEIVED' };
  }
}
