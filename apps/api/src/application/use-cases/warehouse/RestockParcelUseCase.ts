import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';

interface Input {
  /** Magasin dans lequel on remet le colis (peut etre le meme ou autre) */
  warehouseId: string;
  spaceId?: string | null;
  comment?: string;
}

/**
 * Remet un colis en stock apres qu'il a ete marque absent / perdu lors d'un
 * inventaire (status LOST ou isPresent=false). Utilisable meme si l'inventaire
 * d'origine est cloture.
 */
@injectable()
export class RestockParcelUseCase {
  constructor(private history: HistoryService) {}

  async execute(parcelId: string, input: Input, userId: string) {
    const parcel = await prisma.parcel.findUnique({
      where: { id: parcelId },
      include: { warehouse: true, space: true },
    });
    if (!parcel) throw new NotFoundError('Colis', parcelId);
    if (parcel.isPresent && parcel.status === 'IN_STOCK') {
      throw new BusinessError('Le colis est deja en stock.');
    }

    const warehouse = await prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!warehouse) throw new NotFoundError('Magasin', input.warehouseId);

    if (input.spaceId) {
      const sp = await prisma.warehouseSpace.findUnique({ where: { id: input.spaceId } });
      if (!sp || sp.warehouseId !== input.warehouseId) {
        throw new BusinessError('Space invalide pour ce magasin');
      }
    }

    const updated = await prisma.parcel.update({
      where: { id: parcelId },
      data: {
        status: 'IN_STOCK',
        isPresent: true,
        warehouseId: input.warehouseId,
        spaceId: input.spaceId ?? null,
        warehouseEnteredAt: new Date(),
      },
    });

    await this.history.recordParcel({
      parcelId,
      action: 'RESTOCKED',
      statusBefore: parcel.status,
      statusAfter: 'IN_STOCK',
      wasPresentBefore: parcel.isPresent,
      isPresentAfter: true,
      warehouseId: input.warehouseId,
      userId,
      comment: input.comment ?? 'Remis en stock manuellement (retrouve apres inventaire)',
      parcelDesignationSnapshot: parcel.designation,
      parcelTrackingSnapshot: parcel.trackingNumber,
    });

    return updated;
  }
}
