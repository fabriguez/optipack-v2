import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

/**
 * Retourne la liste des colis du magasin qui ne sont pas encore inventories
 * dans cet inventaire (= aucun item correspondant dans `warehouseInventoryItem`).
 *
 * Critere "rattaches au magasin" :
 *   - warehouseId == inventory.warehouseId (actuellement la)
 *   OU
 *   - originalWarehouseId == inventory.warehouseId ET warehouseId IS NULL
 *     (cree ici mais pas place / charge dans un conteneur en transit)
 *
 * On NE filtre PAS sur isPresent ni status : l'operateur d'inventaire doit
 * pouvoir voir tous les colis encore lies au magasin et decider s'il les marque
 * presents (eventuellement avec observation) ou non. Le statut LOADING/IN_TRANSIT
 * apparaitra dans la liste avec son badge pour informer l'operateur.
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
        isDeleted: false,
        OR: [
          { warehouseId: inventory.warehouseId },
          { originalWarehouseId: inventory.warehouseId, warehouseId: null },
        ],
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
