import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

/**
 * Demarre un inventaire pour un magasin.
 * - Refuse si un inventaire IN_PROGRESS existe deja pour ce magasin
 * - Snapshot : tous les colis IN_STOCK + present du magasin sont marques `expected=true`
 */
@injectable()
export class StartInventoryUseCase {
  async execute(warehouseId: string, userId: string, comment?: string) {
    const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundError('Magasin', warehouseId);

    const ongoing = await prisma.warehouseInventory.findFirst({
      where: { warehouseId, status: 'IN_PROGRESS' },
    });
    if (ongoing) {
      throw new BusinessError(
        'Un inventaire est deja en cours pour ce magasin. Cloturez-le avant d\'en demarrer un autre.',
      );
    }

    const expectedParcels = await prisma.parcel.findMany({
      where: {
        warehouseId,
        isDeleted: false,
        status: 'IN_STOCK',
        isPresent: true,
      },
      select: { id: true },
    });

    const inventory = await prisma.warehouseInventory.create({
      data: {
        warehouseId,
        startedById: userId,
        comment: comment ?? null,
        items: {
          create: expectedParcels.map((p) => ({
            parcelId: p.id,
            expected: true,
            scanned: false,
          })),
        },
      },
      include: {
        _count: { select: { items: true } },
      },
    });

    return inventory;
  }
}
