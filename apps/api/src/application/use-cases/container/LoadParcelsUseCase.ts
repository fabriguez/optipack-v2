import { inject, injectable } from 'tsyringe';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { prisma } from '../../../config/database';

@injectable()
export class LoadParcelsUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
  ) {}

  async execute(containerId: string, parcelIds: string[], userId: string) {
    const container = await this.containerRepo.findById(containerId);
    if (!container) throw new NotFoundError('Conteneur', containerId);

    if (container.status !== 'EMPTY' && container.status !== 'LOADING') {
      throw new BusinessError(
        `Impossible de charger dans un conteneur au statut ${container.status}`,
      );
    }

    const loaded: string[] = [];
    const errors: { parcelId: string; reason: string }[] = [];

    for (const parcelId of parcelIds) {
      const parcel = await this.parcelRepo.findById(parcelId);

      if (!parcel) {
        errors.push({ parcelId, reason: 'Colis introuvable' });
        continue;
      }

      if (parcel.status !== 'IN_STOCK') {
        errors.push({ parcelId, reason: `Statut invalide: ${parcel.status}` });
        continue;
      }

      if (!parcel.isPresent) {
        errors.push({ parcelId, reason: 'Colis non present en magasin' });
        continue;
      }

      // Check capacity
      const newLoad = Number(container.currentLoad) + Number(parcel.weight);
      if (newLoad > Number(container.capacity)) {
        errors.push({ parcelId, reason: 'Capacite du conteneur depassee' });
        continue;
      }

      // Load parcel
      await this.parcelRepo.update(parcelId, {
        status: 'LOADING',
        container: { connect: { id: containerId } },
        lastContainer: { connect: { id: containerId } },
        warehouse: { disconnect: true },
        isPresent: true,
      });

      // Update container load
      await this.containerRepo.update(containerId, {
        currentLoad: newLoad,
        status: 'LOADING',
      });

      // History
      await prisma.parcelHistory.create({
        data: {
          parcelId,
          action: 'LOADED_INTO_CONTAINER',
          statusBefore: 'IN_STOCK',
          statusAfter: 'LOADING',
          containerId,
          userId,
          actorType: 'USER',
          parcelDesignationSnapshot: parcel.designation,
          parcelTrackingSnapshot: parcel.trackingNumber,
        },
      });

      loaded.push(parcelId);
    }

    return { loaded: loaded.length, errors, total: parcelIds.length };
  }
}
