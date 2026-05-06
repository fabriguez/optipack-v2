import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

/**
 * Retourne la liste des colis du magasin qui ne sont pas encore inventories
 * (= aucun item correspondant dans `warehouseInventoryItem` pour cet inventaire).
 *
 * Permet a l'operateur de voir d'un coup d'oeil ce qui reste a contoler, et de
 * marquer manuellement les colis sans devoir les scanner.
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

    // Tous les colis physiquement presents au moment de la consultation.
    // On filtre les colis avec warehouseId == inventory.warehouseId, isPresent=true,
    // status IN_STOCK ou RECEIVED (= physiquement la), et non isDeleted.
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
        client: { select: { fullName: true } },
        transitRoute: { select: { name: true, type: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return allParcels.filter((p) => !inventoriedIds.has(p.id));
  }
}
