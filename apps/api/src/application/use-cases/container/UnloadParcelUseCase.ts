import { inject, injectable } from 'tsyringe';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { WAREHOUSE_REPOSITORY, type IWarehouseRepository } from '../../interfaces/IWarehouseRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { prisma } from '../../../config/database';

interface UnloadResult {
  parcelId: string;
  status: 'received' | 'not_found' | 'modified';
  newWeight?: number;
  comment?: string;
}

@injectable()
export class UnloadParcelUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    @inject(WAREHOUSE_REPOSITORY) private warehouseRepo: IWarehouseRepository,
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

    if (container.status !== 'ARRIVED' && container.status !== 'RECEIVED' && container.status !== 'UNLOADING') {
      throw new BusinessError(`Conteneur ne peut pas etre decharge au statut ${container.status}`);
    }

    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new NotFoundError('Colis', parcelId);

    if (parcel.containerId !== containerId) {
      throw new BusinessError('Ce colis ne fait pas partie de ce conteneur');
    }

    const warehouse = await this.warehouseRepo.findById(warehouseId);
    if (!warehouse) throw new NotFoundError('Magasin', warehouseId);

    // Update container to UNLOADING if needed
    if (container.status !== 'UNLOADING') {
      await this.containerRepo.update(containerId, { status: 'UNLOADING' });
    }

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

    // Update container load
    const newLoad = Math.max(0, Number(container.currentLoad) - Number(parcel.weight));
    await this.containerRepo.update(containerId, { currentLoad: newLoad });

    // History
    await prisma.parcelHistory.create({
      data: {
        parcelId,
        action: `UNLOADED_${action.toUpperCase()}`,
        statusBefore: parcel.status,
        statusAfter: action === 'not_found' ? 'LOST' : 'RECEIVED',
        containerId,
        warehouseId,
        userId,
        actorType: 'USER',
        comment: options?.comment,
        parcelDesignationSnapshot: parcel.designation,
        parcelTrackingSnapshot: parcel.trackingNumber,
      },
    });

    return {
      parcelId,
      status: action,
      newWeight: options?.newWeight,
      comment: options?.comment,
    };
  }
}
