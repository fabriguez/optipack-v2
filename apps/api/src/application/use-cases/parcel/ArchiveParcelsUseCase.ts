import { injectable, inject } from 'tsyringe';
import { prisma } from '../../../config/database';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';

interface BulkResult {
  archived: number;
  skipped: number;
  errors: { parcelId: string; reason: string }[];
}

/**
 * Archivage en lot. Le colis archive disparait de tous les listings courants
 * (magasins, conteneurs, recherche...) mais reste accessible via l'onglet
 * "Archives". Trace dans ParcelHistory pour audit.
 *
 * Refus : on ne peut pas archiver un colis encore dans un conteneur en
 * mouvement (status LOADING / IN_TRANSIT) -- il faut le decharger d'abord.
 */
@injectable()
export class ArchiveParcelsUseCase {
  constructor(@inject(HistoryService) private history: HistoryService) {}

  async execute(parcelIds: string[], userId: string, reason?: string): Promise<BulkResult> {
    if (!Array.isArray(parcelIds) || parcelIds.length === 0) {
      throw new BusinessError('Liste de colis vide.');
    }

    const result: BulkResult = { archived: 0, skipped: 0, errors: [] };
    const parcels = await prisma.parcel.findMany({
      where: { id: { in: parcelIds }, isDeleted: false },
      select: { id: true, status: true, isArchived: true, trackingNumber: true },
    });
    const found = new Set(parcels.map((p) => p.id));
    for (const id of parcelIds) {
      if (!found.has(id)) result.errors.push({ parcelId: id, reason: 'Colis introuvable' });
    }

    const archivableIds: string[] = [];
    for (const p of parcels) {
      if (p.isArchived) {
        result.skipped += 1;
        continue;
      }
      if (p.status === 'LOADING' || p.status === 'IN_TRANSIT') {
        result.errors.push({
          parcelId: p.id,
          reason: `Colis ${p.trackingNumber} en mouvement (${p.status}) : decharger d'abord.`,
        });
        continue;
      }
      archivableIds.push(p.id);
    }

    if (archivableIds.length > 0) {
      const now = new Date();
      await prisma.parcel.updateMany({
        where: { id: { in: archivableIds } },
        data: { isArchived: true, archivedAt: now, archivedByUserId: userId },
      });
      // Trace history par colis (en parallele).
      await Promise.all(
        archivableIds.map((id) =>
          this.history.recordParcel({
            parcelId: id,
            action: 'ARCHIVED',
            userId,
            comment: reason ?? null,
          }),
        ),
      );
      result.archived = archivableIds.length;
    }

    return result;
  }
}

/** Desarchivage en lot. Pas de contrainte metier, juste un revert. */
@injectable()
export class UnarchiveParcelsUseCase {
  constructor(@inject(HistoryService) private history: HistoryService) {}

  async execute(parcelIds: string[], userId: string, reason?: string): Promise<BulkResult> {
    if (!Array.isArray(parcelIds) || parcelIds.length === 0) {
      throw new BusinessError('Liste de colis vide.');
    }

    const result: BulkResult = { archived: 0, skipped: 0, errors: [] };
    const parcels = await prisma.parcel.findMany({
      where: { id: { in: parcelIds }, isDeleted: false },
      select: { id: true, isArchived: true },
    });
    const found = new Set(parcels.map((p) => p.id));
    for (const id of parcelIds) {
      if (!found.has(id)) result.errors.push({ parcelId: id, reason: 'Colis introuvable' });
    }

    const targetIds = parcels.filter((p) => p.isArchived).map((p) => p.id);
    result.skipped = parcels.length - targetIds.length;

    if (targetIds.length > 0) {
      await prisma.parcel.updateMany({
        where: { id: { in: targetIds } },
        data: { isArchived: false, archivedAt: null, archivedByUserId: null },
      });
      await Promise.all(
        targetIds.map((id) =>
          this.history.recordParcel({
            parcelId: id,
            action: 'UNARCHIVED',
            userId,
            comment: reason ?? null,
          }),
        ),
      );
      result.archived = targetIds.length;
    }

    return result;
  }
}
