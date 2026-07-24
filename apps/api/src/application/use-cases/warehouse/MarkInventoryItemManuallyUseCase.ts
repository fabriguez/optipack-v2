import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { assertAgencyActive } from '../../services/scope/agencyScope';

interface ManualMarkInput {
  parcelId: string;
  /** True : present sans scan ; False : explicitement marque absent (rare, on peut juste ne pas cocher). */
  present: boolean;
  observation?: string;
}

/**
 * Marque un colis present (ou absent) pendant l'inventaire SANS scan.
 * On positionne :
 *  - scanned = present
 *  - markedManually = true (flag distinguant le check manuel du scan)
 *  - observation libre
 *  - scannedAt + scannedById si present
 *
 * Le flag markedManually permet aux rapports d'inventaire de mettre en evidence
 * les items qui n'ont pas ete physiquement scannes (moins fiable).
 */
@injectable()
export class MarkInventoryItemManuallyUseCase {
  async execute(inventoryId: string, input: ManualMarkInput, userId: string) {
    const inventory = await prisma.warehouseInventory.findUnique({
      where: { id: inventoryId },
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

    const parcel = await prisma.parcel.findUnique({
      where: { id: input.parcelId },
      select: { id: true, trackingNumber: true, warehouseId: true, isPresent: true },
    });
    if (!parcel) throw new NotFoundError('Colis', input.parcelId);

    const existing = await prisma.warehouseInventoryItem.findUnique({
      where: { inventoryId_parcelId: { inventoryId, parcelId: parcel.id } },
    });

    if (existing) {
      const updated = await prisma.warehouseInventoryItem.update({
        where: { id: existing.id },
        data: {
          scanned: input.present,
          scannedAt: input.present ? new Date() : null,
          scannedById: input.present ? userId : null,
          markedManually: true,
          observation: input.observation?.trim() || existing.observation,
        },
      });
      // Marquage absent -> sortie auto du stock (isPresent=false). Si retrouve
      // plus tard, l'utilisateur peut le remettre en stock manuellement via
      // PATCH /parcels/:id/status (ou un endpoint dedie).
      if (!input.present) {
        await prisma.parcel.update({
          where: { id: parcel.id },
          data: { isPresent: false },
        });
      } else if (parcel.isPresent === false) {
        // Marquage present alors que sorti -> on remet en stock
        await prisma.parcel.update({
          where: { id: parcel.id },
          data: { isPresent: true },
        });
      }
      return { status: existing.scanned ? 'updated' : 'marked', item: updated };
    }

    // Pas d'item existant : on en cree un, en flaggant qu'il a ete ajoute manuellement.
    const created = await prisma.warehouseInventoryItem.create({
      data: {
        inventoryId,
        parcelId: parcel.id,
        // expected = true si le colis est attendu dans ce magasin (warehouseId match),
        // false sinon (extra). Cela aide a generer le rapport d'ecart.
        expected: parcel.warehouseId === inventory.warehouseId,
        scanned: input.present,
        scannedAt: input.present ? new Date() : null,
        scannedById: input.present ? userId : null,
        markedManually: true,
        observation: input.observation?.trim() ?? null,
        comment:
          parcel.warehouseId !== inventory.warehouseId
            ? 'Colis appartenant a un autre magasin'
            : null,
      },
    });
    if (!input.present) {
      await prisma.parcel.update({
        where: { id: parcel.id },
        data: { isPresent: false },
      });
    }
    return { status: 'created_manual', item: created };
  }
}
