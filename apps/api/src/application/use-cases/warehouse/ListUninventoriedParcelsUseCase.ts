import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

/**
 * Retourne les colis du magasin qui N'ONT PAS ENCORE ETE POINTES dans cet
 * inventaire. Sert a la saisie rapide quand le QR/code-barres est defectueux.
 *
 * Un colis est "pas encore pointe" si :
 *   - il est physiquement present dans le magasin (warehouseId + isPresent
 *     + status IN_STOCK/RECEIVED + !isDeleted)
 *   - ET (
 *       il n'a aucun WarehouseInventoryItem dans cet inventaire (cas d'un
 *       colis arrive APRES le demarrage de l'inventaire)
 *       OU
 *       il a un item mais il n'a ete ni scanne (scanned=false) ni marque
 *       manuellement (markedManually=false) -- c'est le cas de la majorite
 *       au demarrage : StartInventoryUseCase snapshote tous les colis presents
 *       avec scanned=false, markedManually=false. Ils sont en attente de
 *       pointage.
 *     )
 *
 * Des qu'un colis est scanne, marque present manuellement, ou marque absent,
 * il sort de cette liste (l'item est mis a jour avec scanned=true OU
 * markedManually=true).
 */
@injectable()
export class ListUninventoriedParcelsUseCase {
  async execute(inventoryId: string) {
    const inventory = await prisma.warehouseInventory.findUnique({
      where: { id: inventoryId },
      select: { id: true, warehouseId: true, status: true, startedAt: true },
    });
    if (!inventory) throw new NotFoundError('Inventaire', inventoryId);

    // Items deja traites (scanne OU marque manuellement) : on les exclut.
    const processedItems = await prisma.warehouseInventoryItem.findMany({
      where: {
        inventoryId,
        OR: [{ scanned: true }, { markedManually: true }],
      },
      select: { parcelId: true },
    });
    const processedIds = new Set(processedItems.map((i) => i.parcelId));

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

    return allParcels.filter((p) => !processedIds.has(p.id));
  }
}
