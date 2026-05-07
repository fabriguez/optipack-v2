import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

/**
 * Retourne uniquement les colis PHYSIQUEMENT PRESENTS dans le magasin et qui
 * n'ont pas encore ete inventories dans cet inventaire :
 *   - warehouseId == inventory.warehouseId
 *   - isPresent === true
 *   - status in [IN_STOCK, RECEIVED]
 *   - non supprime
 *   - aucun WarehouseInventoryItem deja existant pour ce parcel/inventaire
 *
 * Sert a la saisie rapide pendant l'inventaire quand le QR/code-barres est
 * defectueux : on peut marquer Present, Absent ou ajouter une note.
 */
@injectable()
export class ListUninventoriedParcelsUseCase {
  async execute(inventoryId: string) {
    const inventory = await prisma.warehouseInventory.findUnique({
      where: { id: inventoryId },
      select: { id: true, warehouseId: true, status: true, startedAt: true },
    });
    if (!inventory) throw new NotFoundError('Inventaire', inventoryId);

    const inventoriedItems = await prisma.warehouseInventoryItem.findMany({
      where: { inventoryId },
      select: { parcelId: true },
    });
    const inventoriedIds = new Set(inventoriedItems.map((i) => i.parcelId));

    const allParcels = await prisma.parcel.findMany({
      where: {
        warehouseId: inventory.warehouseId,
        isDeleted: false,
        isPresent: true,
        status: { in: ['IN_STOCK', 'RECEIVED'] },
      },
      select: {
        id: true,
        trackingNumber: true,
        designation: true,
        weight: true,
        category: true,
        status: true,
        isPresent: true,
        warehouseId: true,
        originalWarehouseId: true,
        client: { select: { fullName: true } },
        transitRoute: { select: { name: true, type: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return allParcels.filter((p) => !inventoriedIds.has(p.id));
  }
}
