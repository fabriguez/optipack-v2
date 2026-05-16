import { inject, injectable } from 'tsyringe';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { HistoryService } from '../../services/HistoryService';

const LOADABLE_STATUSES = new Set(['EMPTY', 'LOADING']);

@injectable()
export class LoadParcelsUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    private history: HistoryService,
  ) {}

  async execute(containerId: string, parcelIds: string[], userId: string) {
    const container = await this.containerRepo.findById(containerId);
    if (!container) throw new NotFoundError('Conteneur', containerId);

    if (!LOADABLE_STATUSES.has(container.status)) {
      throw new BusinessError(
        `Impossible de charger : le conteneur est au statut ${container.status}. Seuls les conteneurs vides ou en chargement acceptent des colis.`,
      );
    }

    const previousStatus = container.status;
    const loaded: string[] = [];
    const errors: { parcelId: string; reason: string }[] = [];
    let runningLoad = Number(container.currentLoad);

    for (const parcelId of parcelIds) {
      const parcel = await this.parcelRepo.findById(parcelId);

      if (!parcel) {
        errors.push({ parcelId, reason: 'Colis introuvable' });
        continue;
      }

      if (parcel.status !== 'IN_STOCK') {
        errors.push({ parcelId, reason: `Statut invalide: ${parcel.status}` });
        continue;
      }

      if (!parcel.isPresent) {
        errors.push({ parcelId, reason: 'Colis non present en magasin' });
        continue;
      }

      // On refuse de charger un colis dont la destination est l'agence de depart
      // du conteneur : il est deja a destination, l'expedier serait une erreur.
      if (parcel.destinationAgencyId && parcel.destinationAgencyId === container.departureAgencyId) {
        errors.push({
          parcelId,
          reason: "Destination du colis = agence de depart du conteneur",
        });
        continue;
      }

      // Regle de matching de type : conteneur d'acheminement accepte tout
      if (!container.isForwarding) {
        const parcelType = parcel.transitRoute?.type;
        if (parcelType && parcelType !== container.type) {
          errors.push({
            parcelId,
            reason: `Type incompatible : colis ${parcelType} dans conteneur ${container.type}`,
          });
          continue;
        }
      }

      // Audit fix #10 : refus des marchandises dangereuses dans les conteneurs AIR
      // (sauf forwarding). Reglementation IATA standard.
      if (parcel.isHazardous && container.type === 'AIR' && !container.isForwarding) {
        errors.push({
          parcelId,
          reason: 'Marchandise dangereuse interdite en conteneur aerien (sauf acheminement)',
        });
        continue;
      }

      // Verification capacite (si poids defini)
      const parcelWeight = parcel.weight ? Number(parcel.weight) : 0;
      const newLoad = runningLoad + parcelWeight;
      if (newLoad > Number(container.capacity)) {
        errors.push({ parcelId, reason: 'Capacite du conteneur depassee' });
        continue;
      }

      await this.parcelRepo.update(parcelId, {
        status: 'LOADING',
        container: { connect: { id: containerId } },
        lastContainer: { connect: { id: containerId } },
        warehouse: { disconnect: true },
        isPresent: true,
      });

      runningLoad = newLoad;
      await this.containerRepo.update(containerId, {
        currentLoad: runningLoad,
        status: 'LOADING',
        ...(previousStatus === 'EMPTY' && { loadingDate: new Date() }),
      });

      await this.history.recordParcel({
        parcelId,
        action: 'LOADED_INTO_CONTAINER',
        statusBefore: 'IN_STOCK',
        statusAfter: 'LOADING',
        containerId,
        warehouseId: parcel.warehouseId ?? null,
        userId,
        parcelDesignationSnapshot: parcel.designation,
        parcelTrackingSnapshot: parcel.trackingNumber,
        comment: `Charge dans ${container.designation}`,
      });

      // Emit event for each loaded parcel so notifications can be dispatched
      try {
        eventBus.emit({
          type: DomainEvents.PARCEL_LOADED,
          payload: {
            parcelId,
            containerId,
            trackingNumber: parcel.trackingNumber,
            designation: parcel.designation,
            clientId: parcel.clientId,
            agencyId: container.departureAgencyId,
            organizationId: (parcel as any).organizationId ?? null,
            // Le template "Colis charge" affiche le nom du conteneur.
            containerName: container.designation,
          },
          timestamp: new Date(),
          userId,
        });
      } catch (e) {
        // non blocking
      }

      loaded.push(parcelId);
    }

    // Historique conteneur (un seul evenement pour la session de chargement)
    if (loaded.length > 0) {
      await this.history.recordContainer({
        containerId,
        action: 'PARCELS_LOADED',
        statusBefore: previousStatus,
        statusAfter: 'LOADING',
        userId,
        comment: `${loaded.length} colis charge(s)`,
        changes: {
          loadedParcelIds: loaded,
          newLoad: runningLoad,
          errors: errors.length,
        },
      });
    }

    return { loaded: loaded.length, errors, total: parcelIds.length };
  }
}
