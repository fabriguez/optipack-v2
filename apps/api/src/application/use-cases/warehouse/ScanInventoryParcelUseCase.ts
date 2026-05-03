import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

/**
 * Scanne un colis pendant un inventaire (par tracking ou parcelId).
 * - Si le colis figure dans `items` (= attendu) : marque scanned=true
 * - Si le colis n'existe pas dans `items` mais appartient au magasin : on l'ajoute
 *   en tant qu'extra (expected=false, scanned=true)
 * - Si le colis appartient a un autre magasin : conflit (l'operateur doit decider)
 */
@injectable()
export class ScanInventoryParcelUseCase {
  async execute(inventoryId: string, trackingOrId: string, userId: string) {
    const inventory = await prisma.warehouseInventory.findUnique({
      where: { id: inventoryId },
    });
    if (!inventory) throw new NotFoundError('Inventaire', inventoryId);
    if (inventory.status !== 'IN_PROGRESS') {
      throw new BusinessError("L'inventaire n'est pas en cours.");
    }

    const tracking = this.extractTracking(trackingOrId);
    let parcel = await prisma.parcel.findFirst({
      where: { OR: [{ id: tracking }, { trackingNumber: tracking }] },
      select: { id: true, trackingNumber: true, designation: true, warehouseId: true },
    });
    if (!parcel) throw new NotFoundError('Colis', tracking);

    if (parcel.warehouseId !== inventory.warehouseId) {
      // colis present mais appartenant a un autre magasin = anomalie
      // on l'enregistre quand meme comme item extra avec un commentaire.
    }

    const existing = await prisma.warehouseInventoryItem.findUnique({
      where: { inventoryId_parcelId: { inventoryId, parcelId: parcel.id } },
    });

    if (existing) {
      if (existing.scanned) {
        return {
          status: 'already_scanned',
          item: existing,
          parcel,
        };
      }
      const updated = await prisma.warehouseInventoryItem.update({
        where: { id: existing.id },
        data: {
          scanned: true,
          scannedAt: new Date(),
          scannedById: userId,
        },
      });
      return { status: 'scanned', item: updated, parcel };
    }

    // Item extra : non attendu mais present
    const created = await prisma.warehouseInventoryItem.create({
      data: {
        inventoryId,
        parcelId: parcel.id,
        expected: false,
        scanned: true,
        scannedAt: new Date(),
        scannedById: userId,
        comment: parcel.warehouseId !== inventory.warehouseId
          ? `Colis enregistre dans un autre magasin (${parcel.warehouseId})`
          : null,
      },
    });
    return { status: 'extra', item: created, parcel };
  }

  private extractTracking(input: string): string {
    const trimmed = input.trim();
    if (trimmed.includes('/tracking/')) {
      const m = trimmed.match(/\/tracking\/([^/?#]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    return trimmed;
  }
}
