import { injectable, inject } from 'tsyringe';
import { prisma } from '../../../config/database';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';

/** Colis retenu pour l'evenement d'archivage (scope agence + libelle). */
type ArchivedParcelView = {
  id: string;
  trackingNumber: string;
  organizationId: string;
  warehouse: { agencyId: string } | null;
};

/**
 * Emet un evenement d'archivage agrege : une seule alerte pour un lot, avec
 * les numeros de suivi concernes. Best-effort, jamais bloquant.
 */
function emitArchiveEvent(
  type: typeof DomainEvents.PARCEL_ARCHIVED | typeof DomainEvents.PARCEL_UNARCHIVED,
  parcels: ArchivedParcelView[],
  userId: string,
  reason?: string,
): void {
  if (parcels.length === 0) return;
  try {
    eventBus.emit({
      type,
      payload: {
        parcelIds: parcels.map((p) => p.id),
        trackingNumbers: parcels.map((p) => p.trackingNumber),
        count: parcels.length,
        reason: reason ?? null,
        agencyId: parcels.find((p) => p.warehouse?.agencyId)?.warehouse?.agencyId ?? null,
        organizationId: parcels[0]?.organizationId ?? null,
      },
      timestamp: new Date(),
      userId,
    });
  } catch {
    // non bloquant
  }
}

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
      select: {
        id: true, status: true, isArchived: true, trackingNumber: true,
        organizationId: true, warehouse: { select: { agencyId: true } },
      },
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
      const archivedSet = new Set(archivableIds);
      emitArchiveEvent(
        DomainEvents.PARCEL_ARCHIVED,
        parcels.filter((p) => archivedSet.has(p.id)),
        userId,
        reason,
      );
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
      select: {
        id: true, isArchived: true, trackingNumber: true,
        organizationId: true, warehouse: { select: { agencyId: true } },
      },
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
      const targetSet = new Set(targetIds);
      emitArchiveEvent(
        DomainEvents.PARCEL_UNARCHIVED,
        parcels.filter((p) => targetSet.has(p.id)),
        userId,
        reason,
      );
    }

    return result;
  }
}
