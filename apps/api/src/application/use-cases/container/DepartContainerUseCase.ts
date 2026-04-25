import { inject, injectable } from 'tsyringe';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { HistoryService } from '../../services/HistoryService';

@injectable()
export class DepartContainerUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    private history: HistoryService,
  ) {}

  async execute(containerId: string, userId: string) {
    const container = await this.containerRepo.findById(containerId);
    if (!container) throw new NotFoundError('Conteneur', containerId);

    if (container.status !== 'LOADING') {
      throw new BusinessError(
        `Le conteneur doit etre en chargement pour partir. Statut actuel: ${container.status}`,
      );
    }

    const departureDate = new Date();
    await this.containerRepo.update(containerId, {
      status: 'IN_TRANSIT',
      departureDate,
    });

    const parcels = await this.parcelRepo.findByContainer(containerId);
    const parcelIds = parcels.map((p) => p.id);

    if (parcelIds.length > 0) {
      await this.parcelRepo.updateMany(parcelIds, { status: 'IN_TRANSIT' });

      await this.history.recordParcelMany(
        parcels.map((p) => ({
          parcelId: p.id,
          action: 'CONTAINER_DEPARTED',
          statusBefore: 'LOADING',
          statusAfter: 'IN_TRANSIT',
          containerId,
          userId,
          parcelDesignationSnapshot: p.designation,
          parcelTrackingSnapshot: p.trackingNumber,
          comment: `Depart du conteneur ${container.designation}`,
        })),
      );
    }

    await this.history.recordContainer({
      containerId,
      action: 'DEPARTED',
      statusBefore: 'LOADING',
      statusAfter: 'IN_TRANSIT',
      userId,
      comment: `Depart - ${parcelIds.length} colis a bord`,
      changes: { departureDate: departureDate.toISOString(), parcelCount: parcelIds.length },
    });

    eventBus.emit({
      type: DomainEvents.CONTAINER_DEPARTED,
      payload: { containerId, parcelCount: parcelIds.length },
      timestamp: new Date(),
      userId,
    });

    return { containerId, parcelCount: parcelIds.length, status: 'IN_TRANSIT' };
  }
}
