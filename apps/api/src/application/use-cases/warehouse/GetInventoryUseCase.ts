import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class GetInventoryUseCase {
  async execute(inventoryId: string) {
    const inventory = await prisma.warehouseInventory.findUnique({
      where: { id: inventoryId },
      include: {
        warehouse: { select: { id: true, name: true, location: true } },
        startedBy: { select: { id: true, firstName: true, lastName: true } },
        closedBy: { select: { id: true, firstName: true, lastName: true } },
        items: {
          include: {
            parcel: {
              select: {
                id: true,
                trackingNumber: true,
                designation: true,
                weight: true,
                volume: true,
              },
            },
          },
          orderBy: { scannedAt: 'desc' },
        },
      },
    });
    if (!inventory) throw new NotFoundError('Inventaire', inventoryId);

    const matched = inventory.items.filter((i) => i.expected && i.scanned);
    const missing = inventory.items.filter((i) => i.expected && !i.scanned);
    const extra = inventory.items.filter((i) => !i.expected && i.scanned);

    return {
      ...inventory,
      counts: {
        expected: matched.length + missing.length,
        scanned: matched.length + extra.length,
        matched: matched.length,
        missing: missing.length,
        extra: extra.length,
      },
    };
  }

  async listByWarehouse(warehouseId: string) {
    return prisma.warehouseInventory.findMany({
      where: { warehouseId },
      orderBy: { startedAt: 'desc' },
      include: {
        startedBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
    });
  }
}
