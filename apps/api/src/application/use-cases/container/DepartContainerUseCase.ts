import { inject, injectable } from 'tsyringe';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { prisma } from '../../../config/database';

@injectable()
export class DepartContainerUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
  ) {}

  async execute(containerId: string, userId: string) {
    const container = await this.containerRepo.findById(containerId);
    if (!container) throw new NotFoundError('Conteneur', containerId);

    if (container.status !== 'LOADING') {
      throw new BusinessError(`Le conteneur doit etre en chargement pour partir. Statut actuel: ${container.status}`);
    }

    // Update container status
    await this.containerRepo.update(containerId, {
      status: 'IN_TRANSIT',
      departureDate: new Date(),
    });

    // Update all parcels in container to IN_TRANSIT
    const parcels = await this.parcelRepo.findByContainer(containerId);
    const parcelIds = parcels.map((p) => p.id);

    if (parcelIds.length > 0) {
      await this.parcelRepo.updateMany(parcelIds, { status: 'IN_TRANSIT' });

      // Create history for each parcel
      await prisma.parcelHistory.createMany({
        data: parcelIds.map((parcelId) => ({
          parcelId,
          action: 'CONTAINER_DEPARTED',
          statusBefore: 'LOADING',
          statusAfter: 'IN_TRANSIT',
          containerId,
          userId,
          actorType: 'USER',
        })),
      });
    }

    // Container history
    await prisma.containerHistory.create({
      data: {
        containerId,
        action: 'DEPARTED',
        statusBefore: 'LOADING',
        statusAfter: 'IN_TRANSIT',
        userId,
        actorType: 'USER',
      },
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
