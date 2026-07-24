import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { assertAgencyActive } from '../../services/scope/agencyScope';

/**
 * Cloture un inventaire et calcule le rapport de reconciliation.
 * - matched : items expected & scanned
 * - missing : items expected & !scanned (colis manquant physiquement)
 * - extra   : items !expected & scanned (colis present mais non attendu)
 *
 * Aucune mutation automatique des colis (ex : mettre LOST sur les manquants).
 * L'admin decide via les actions de suivi normales.
 */
@injectable()
export class CloseInventoryUseCase {
  async execute(inventoryId: string, userId: string) {
    const inventory = await prisma.warehouseInventory.findUnique({
      where: { id: inventoryId },
      include: {
        items: {
          include: {
            parcel: {
              select: { id: true, trackingNumber: true, designation: true },
            },
          },
        },
      },
    });
    if (!inventory) throw new NotFoundError('Inventaire', inventoryId);
    if (inventory.status !== 'IN_PROGRESS') {
      throw new BusinessError("L'inventaire n'est pas en cours.");
    }

    // Aucune ecriture sur une agence desactivee (agence du magasin inventorie).
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: inventory.warehouseId },
      select: { agencyId: true },
    });
    if (warehouse?.agencyId) await assertAgencyActive(warehouse.agencyId);

    const matched = inventory.items.filter((i) => i.expected && i.scanned);
    const missing = inventory.items.filter((i) => i.expected && !i.scanned);
    const extra = inventory.items.filter((i) => !i.expected && i.scanned);

    await prisma.warehouseInventory.update({
      where: { id: inventoryId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: userId,
      },
    });

    return {
      inventoryId,
      counts: {
        expected: matched.length + missing.length,
        scanned: matched.length + extra.length,
        matched: matched.length,
        missing: missing.length,
        extra: extra.length,
      },
      matched: matched.map((i) => i.parcel),
      missing: missing.map((i) => i.parcel),
      extra: extra.map((i) => i.parcel),
    };
  }
}
