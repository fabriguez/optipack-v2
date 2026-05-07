import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

interface StorageFeeBreakdown {
  applicable: boolean;
  reason?: string;
  daysInWarehouse: number;
  freeDays: number;
  chargeableDays: number;
  dailyRate: number;
  totalFee: number;
  enteredAt: string | null;
  warehouseName: string | null;
}

/**
 * Calcule les frais de magasinage d'un colis :
 *  - Applique uniquement si le colis est issu d'un conteneur (lastContainerId set)
 *  - Compte les jours depuis warehouseEnteredAt (ou createdAt si null)
 *  - Soustrait `warehouse.storageFreeDays`
 *  - Multiplie par `warehouse.storageDailyRate`
 *
 * Resultat: 0 si non applicable ou si dans la periode gratuite.
 */
@injectable()
export class ComputeStorageFeeUseCase {
  async execute(parcelId: string, asOf?: Date): Promise<StorageFeeBreakdown> {
    const parcel = await prisma.parcel.findUnique({
      where: { id: parcelId },
      include: { warehouse: true },
    });
    if (!parcel) throw new NotFoundError('Colis', parcelId);

    const refDate = asOf ?? new Date();

    // Pas issu d'un conteneur -> pas de frais magasinage
    if (!parcel.lastContainerId) {
      return {
        applicable: false,
        reason: 'Colis non issu d\'un conteneur',
        daysInWarehouse: 0,
        freeDays: parcel.warehouse?.storageFreeDays ?? 0,
        chargeableDays: 0,
        dailyRate: Number(parcel.warehouse?.storageDailyRate ?? 0),
        totalFee: 0,
        enteredAt: null,
        warehouseName: parcel.warehouse?.name ?? null,
      };
    }
    if (!parcel.warehouse) {
      return {
        applicable: false,
        reason: 'Colis sans magasin',
        daysInWarehouse: 0,
        freeDays: 0,
        chargeableDays: 0,
        dailyRate: 0,
        totalFee: 0,
        enteredAt: null,
        warehouseName: null,
      };
    }

    const enteredAt = parcel.warehouseEnteredAt ?? parcel.createdAt;
    const ms = refDate.getTime() - new Date(enteredAt).getTime();
    const days = Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
    const freeDays = parcel.warehouse.storageFreeDays;
    const chargeable = Math.max(0, days - freeDays);
    const rate = Number(parcel.warehouse.storageDailyRate);
    const totalFee = chargeable * rate;

    return {
      applicable: true,
      daysInWarehouse: days,
      freeDays,
      chargeableDays: chargeable,
      dailyRate: rate,
      totalFee,
      enteredAt: new Date(enteredAt).toISOString(),
      warehouseName: parcel.warehouse.name,
    };
  }
}
