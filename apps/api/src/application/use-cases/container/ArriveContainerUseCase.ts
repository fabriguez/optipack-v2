import { inject, injectable } from 'tsyringe';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { MANIFEST_REPOSITORY, type IManifestRepository } from '../../interfaces/IManifestRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { HistoryService } from '../../services/HistoryService';

@injectable()
export class ArriveContainerUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    @inject(MANIFEST_REPOSITORY) private manifestRepo: IManifestRepository,
    private history: HistoryService,
  ) {}

  async execute(containerId: string, userId: string) {
    const container = await this.containerRepo.findById(containerId);
    if (!container) throw new NotFoundError('Conteneur', containerId);

    if (container.status !== 'IN_TRANSIT') {
      throw new BusinessError(
        `Le conteneur doit etre en transit pour arriver. Statut actuel: ${container.status}`,
      );
    }

    const arrivalDate = new Date();
    await this.containerRepo.update(containerId, {
      status: 'RECEIVED',
      actualArrivalDate: arrivalDate,
    });

    const parcels = await this.parcelRepo.findByContainer(containerId);
    const parcelIds = parcels.map((p) => p.id);

    if (parcelIds.length > 0) {
      // Cote colis : ARRIVED (= dans le conteneur a destination, en attente de dechargement).
      // Quand le colis sera reellement decharge en magasin, il passera a RECEIVED.
      await this.parcelRepo.updateMany(parcelIds, {
        status: 'ARRIVED',
        arrivalDate,
        penaltyStartDate: arrivalDate,
      });

      await this.history.recordParcelMany(
        parcels.map((p) => ({
          parcelId: p.id,
          action: 'CONTAINER_ARRIVED',
          statusBefore: 'IN_TRANSIT',
          statusAfter: 'ARRIVED',
          containerId,
          userId,
          parcelDesignationSnapshot: p.designation,
          parcelTrackingSnapshot: p.trackingNumber,
          comment: `Arrivee du conteneur ${container.designation}`,
        })),
      );
    }

    await this.history.recordContainer({
      containerId,
      action: 'RECEIVED',
      statusBefore: 'IN_TRANSIT',
      statusAfter: 'RECEIVED',
      userId,
      comment: `Arrivee - ${parcelIds.length} colis a decharger`,
      changes: { arrivalDate: arrivalDate.toISOString(), parcelCount: parcelIds.length },
    });

    // Auto-generation du bordereau de reception a l'arrivee.
    // Best-effort : un echec est loggue dans l'historique conteneur pour
    // visibilite, mais ne bloque pas l'arrivee. Idempotent : si un bordereau
    // de reception existe deja pour ce conteneur, on saute.
    if (parcelIds.length > 0) {
      try {
        const existing = await this.manifestRepo.findByContainer(containerId);
        const alreadyHasReception = existing.some((m) => m.type === 'RECEPTION');
        if (alreadyHasReception) {
          // Pas de regeneration auto : on garde le bordereau existant.
        } else {
        const manifest = await this.manifestRepo.createReceptionManifest(containerId, userId);
        await this.history.recordContainer({
          containerId,
          action: 'RECEPTION_MANIFEST_CREATED',
          userId,
          comment: `Bordereau de reception ${manifest.number} genere automatiquement`,
          changes: { manifestId: manifest.id, number: manifest.number, lineCount: manifest.lines.length },
        });
        }
      } catch (err) {
        try {
          await this.history.recordContainer({
            containerId,
            action: 'RECEPTION_MANIFEST_FAILED',
            userId,
            comment: 'Echec generation auto bordereau reception',
            changes: { error: err instanceof Error ? err.message : String(err) } as any,
          });
        } catch { /* skip */ }
      }
    }

    eventBus.emit({
      type: DomainEvents.CONTAINER_ARRIVED,
      payload: { containerId, parcelCount: parcelIds.length },
      timestamp: new Date(),
      userId,
    });

    // Emit parcel status change events for each parcel (IN_TRANSIT -> ARRIVED)
    try {
      for (const p of parcels) {
        try {
          eventBus.emit({
            type: DomainEvents.PARCEL_STATUS_CHANGED,
            payload: { parcelId: p.id, oldStatus: 'IN_TRANSIT', newStatus: 'ARRIVED', trackingNumber: p.trackingNumber },
            timestamp: new Date(),
            userId,
          });
        } catch (e) {
          // non blocking
        }
      }
    } catch (e) {
      // non blocking
    }

    return { containerId, parcelCount: parcelIds.length, status: 'RECEIVED' };
  }
}
