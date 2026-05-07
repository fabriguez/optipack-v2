import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';

interface Input {
  /** Colis enregistre lors de l'inventaire (designation libre) */
  designation: string;
  weight?: number;
  observation?: string;
  /** Client a qui rattacher le colis. Obligatoire pour creer un Parcel. */
  clientId: string;
  /** Optionnel : space de rangement */
  spaceId?: string | null;
}

/**
 * Lors de l'inventaire, un colis est trouve physiquement mais n'existe pas
 * dans le systeme. Cet use case cree le Parcel directement en stock dans le
 * magasin de l'inventaire (status IN_STOCK), avec tracking auto-genere.
 *
 * L'item correspondant est cree dans WarehouseInventoryItem avec
 * expected=false, scanned=true, markedManually=true (= "extra trouve").
 */
@injectable()
export class RegisterExtraInventoryParcelUseCase {
  constructor(private history: HistoryService) {}

  async execute(inventoryId: string, input: Input, userId: string) {
    const inventory = await prisma.warehouseInventory.findUnique({
      where: { id: inventoryId },
      include: { warehouse: { include: { agency: true } } },
    });
    if (!inventory) throw new NotFoundError('Inventaire', inventoryId);
    if (!inventory.warehouse) throw new NotFoundError('Magasin', inventory.warehouseId);
    if (inventory.status !== 'IN_PROGRESS') {
      throw new BusinessError("L'inventaire n'est pas en cours.");
    }
    if (!input.designation?.trim()) throw new BusinessError('Designation obligatoire');

    const client = await prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw new NotFoundError('Client', input.clientId);

    if (input.spaceId) {
      const sp = await prisma.warehouseSpace.findUnique({ where: { id: input.spaceId } });
      if (!sp || sp.warehouseId !== inventory.warehouseId) {
        throw new BusinessError('Space invalide pour ce magasin');
      }
    }

    const trackingNumber = `EXTRA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const parcel = await prisma.parcel.create({
      data: {
        organizationId: inventory.warehouse.agency.organizationId,
        trackingNumber,
        designation: input.designation.trim(),
        weight: input.weight ?? null,
        destination: inventory.warehouse.agency.id,
        observation:
          (input.observation ?? '') +
          ' [Colis trouve physiquement lors de l\'inventaire, enregistre en stock]',
        status: 'IN_STOCK',
        isPresent: true,
        clientId: input.clientId,
        warehouseId: inventory.warehouseId,
        originalWarehouseId: inventory.warehouseId,
        warehouseEnteredAt: new Date(),
        spaceId: input.spaceId ?? null,
        price: 0,
      },
    });

    await prisma.warehouseInventoryItem.create({
      data: {
        inventoryId,
        parcelId: parcel.id,
        expected: false,
        scanned: true,
        scannedAt: new Date(),
        scannedById: userId,
        markedManually: true,
        observation: 'Colis enregistre en stock pendant l\'inventaire (extra)',
      },
    });

    await this.history.recordParcel({
      parcelId: parcel.id,
      action: 'INVENTORY_REGISTERED',
      statusBefore: null,
      statusAfter: 'IN_STOCK',
      isPresentAfter: true,
      warehouseId: inventory.warehouseId,
      userId,
      comment: 'Colis trouve physiquement lors de l\'inventaire et enregistre en stock',
      parcelDesignationSnapshot: parcel.designation,
      parcelTrackingSnapshot: parcel.trackingNumber,
      metadata: { inventoryId, clientId: input.clientId },
    });

    return parcel;
  }
}
