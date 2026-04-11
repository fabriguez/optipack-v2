import { inject, injectable } from 'tsyringe';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { prisma } from '../../../config/database';

@injectable()
export class ArriveContainerUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
  ) {}

  async execute(containerId: string, userId: string) {
    const container = await this.containerRepo.findById(containerId);
    if (!container) throw new NotFoundError('Conteneur', containerId);

    if (container.status !== 'IN_TRANSIT') {
      throw new BusinessError(`Le conteneur doit etre en transit pour arriver. Statut actuel: ${container.status}`);
    }

    await this.containerRepo.update(containerId, {
      status: 'ARRIVED',
      actualArrivalDate: new Date(),
    });

    // Update all parcels to ARRIVED
    const parcels = await this.parcelRepo.findByContainer(containerId);
    const parcelIds = parcels.map((p) => p.id);

    if (parcelIds.length > 0) {
      await this.parcelRepo.updateMany(parcelIds, {
        status: 'ARRIVED',
        arrivalDate: new Date(),
        penaltyStartDate: new Date(),
      });

      await prisma.parcelHistory.createMany({
        data: parcelIds.map((parcelId) => ({
          parcelId,
          action: 'CONTAINER_ARRIVED',
          statusBefore: 'IN_TRANSIT',
          statusAfter: 'ARRIVED',
          containerId,
          userId,
          actorType: 'USER',
        })),
      });
    }

    await prisma.containerHistory.create({
      data: {
        containerId,
        action: 'ARRIVED',
        statusBefore: 'IN_TRANSIT',
        statusAfter: 'ARRIVED',
        userId,
        actorType: 'USER',
      },
    });

    eventBus.emit({
      type: DomainEvents.CONTAINER_ARRIVED,
      payload: { containerId, parcelCount: parcelIds.length },
      timestamp: new Date(),
      userId,
    });

    return { containerId, parcelCount: parcelIds.length, status: 'ARRIVED' };
  }
}
