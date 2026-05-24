import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';

/**
 * Soft-delete d'un colis : set isDeleted=true + deletedAt. Le colis disparait
 * des listings (filtre `isDeleted: false`) mais reste en DB pour audit.
 *
 * Refuse si le colis est embarque dans un conteneur (containerId non null)
 * ou deja livre (status DELIVERED) -- ces cas relevent de 'Marquer perdu'
 * (status=LOST) ou d'une procedure de rectification, pas d'une suppression.
 */
@injectable()
export class DeleteParcelUseCase {
  constructor(@inject(HistoryService) private history: HistoryService) {}

  async execute(parcelId: string, userId: string): Promise<void> {
    const parcel = await prisma.parcel.findUnique({
      where: { id: parcelId },
      select: {
        id: true,
        designation: true,
        trackingNumber: true,
        isDeleted: true,
        containerId: true,
        status: true,
        warehouseId: true,
      },
    });
    if (!parcel) throw new NotFoundError('Colis', parcelId);
    if (parcel.isDeleted) throw new BusinessError('Ce colis est deja supprime.');
    if (parcel.containerId) {
      throw new BusinessError(
        'Impossible de supprimer un colis charge dans un conteneur. Retirez-le d\'abord du conteneur.',
      );
    }
    if (parcel.status === 'DELIVERED') {
      throw new BusinessError(
        'Impossible de supprimer un colis deja livre. Utilisez une procedure de rectification.',
      );
    }

    await prisma.parcel.update({
      where: { id: parcelId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    await this.history.recordParcel({
      parcelId,
      action: 'DELETED',
      statusBefore: parcel.status,
      statusAfter: parcel.status,
      warehouseId: parcel.warehouseId,
      userId,
      parcelDesignationSnapshot: parcel.designation,
      parcelTrackingSnapshot: parcel.trackingNumber,
    });
  }
}
