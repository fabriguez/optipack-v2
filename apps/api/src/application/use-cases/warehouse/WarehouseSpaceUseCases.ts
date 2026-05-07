import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';

interface SpaceInput {
  id?: string;
  name: string;
  description?: string;
  isActive?: boolean;
}

@injectable()
export class ListWarehouseSpacesUseCase {
  async execute(warehouseId: string) {
    // Renvoie aussi le nombre de colis dans chaque space
    const spaces = await prisma.warehouseSpace.findMany({
      where: { warehouseId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { parcels: true } } },
    });
    return spaces.map((s) => ({
      ...s,
      parcelCount: s._count.parcels,
      _count: undefined as any,
    }));
  }
}

@injectable()
export class UpsertWarehouseSpacesUseCase {
  /** Replace-all : supprime les spaces retires (sauf s'ils ont des colis), upsert les autres. */
  async execute(warehouseId: string, items: SpaceInput[]) {
    const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundError('Magasin', warehouseId);

    const names = new Set<string>();
    for (const it of items) {
      const n = it.name?.trim();
      if (!n) throw new BusinessError('Chaque space doit avoir un nom');
      if (names.has(n)) throw new BusinessError(`Doublon : ${n}`);
      names.add(n);
    }

    return prisma.$transaction(async (tx) => {
      const existing = await tx.warehouseSpace.findMany({ where: { warehouseId } });
      const keepIds = new Set(items.filter((i) => i.id).map((i) => i.id as string));
      // Suppression des spaces retires (sauf s'ils ont des colis)
      for (const e of existing) {
        if (!keepIds.has(e.id)) {
          const c = await tx.parcel.count({ where: { spaceId: e.id } });
          if (c > 0) {
            // On le desactive plutot que de supprimer
            await tx.warehouseSpace.update({
              where: { id: e.id },
              data: { isActive: false },
            });
          } else {
            await tx.warehouseSpace.delete({ where: { id: e.id } });
          }
        }
      }
      // Upsert
      for (const it of items) {
        if (it.id) {
          await tx.warehouseSpace.update({
            where: { id: it.id },
            data: {
              name: it.name.trim(),
              description: it.description ?? null,
              isActive: it.isActive ?? true,
            },
          });
        } else {
          await tx.warehouseSpace.create({
            data: {
              warehouseId,
              name: it.name.trim(),
              description: it.description ?? null,
              isActive: it.isActive ?? true,
            },
          });
        }
      }
      return tx.warehouseSpace.findMany({
        where: { warehouseId },
        orderBy: { name: 'asc' },
        include: { _count: { select: { parcels: true } } },
      });
    });
  }
}

@injectable()
export class MoveParcelToSpaceUseCase {
  constructor(private history: HistoryService) {}

  async execute(parcelId: string, spaceId: string | null, userId: string, comment?: string) {
    const parcel = await prisma.parcel.findUnique({
      where: { id: parcelId },
      include: { space: true },
    });
    if (!parcel) throw new NotFoundError('Colis', parcelId);
    if (!parcel.warehouseId) {
      throw new BusinessError("Ce colis n'est pas dans un magasin actuellement.");
    }

    let target: { id: string; name: string } | null = null;
    if (spaceId) {
      const space = await prisma.warehouseSpace.findUnique({ where: { id: spaceId } });
      if (!space) throw new NotFoundError('Space', spaceId);
      if (space.warehouseId !== parcel.warehouseId) {
        throw new BusinessError("Le space appartient a un autre magasin.");
      }
      target = { id: space.id, name: space.name };
    }

    if (parcel.spaceId === (target?.id ?? null)) {
      return parcel; // pas de changement
    }

    const updated = await prisma.parcel.update({
      where: { id: parcelId },
      data: { spaceId: target?.id ?? null },
    });

    await this.history.recordParcel({
      parcelId,
      action: 'SPACE_CHANGED',
      userId,
      comment:
        comment ??
        `Deplace ${parcel.space ? `de "${parcel.space.name}"` : '(aucun)'} vers ${
          target ? `"${target.name}"` : '(aucun)'
        }`,
      metadata: {
        fromSpaceId: parcel.spaceId,
        fromSpaceName: parcel.space?.name ?? null,
        toSpaceId: target?.id ?? null,
        toSpaceName: target?.name ?? null,
      },
    });

    return updated;
  }
}
