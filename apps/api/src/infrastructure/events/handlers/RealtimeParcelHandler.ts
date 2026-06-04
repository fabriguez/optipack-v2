import { eventBus, DomainEvents, type DomainEvent } from '../EventBus';
import { realtimeService } from '../../realtime/RealtimeService';
import { createChildLogger } from '../../../config/logger';

const logger = createChildLogger('RealtimeParcel');

/**
 * Emet un event socket `parcel:updated` vers la room du client proprietaire a
 * CHAQUE changement de statut de colis, quel que soit le chemin metier :
 *  - changement de statut direct (UpdateParcelStatusUseCase)
 *  - chargement / dechargement conteneur (Load/UnloadParcelUseCase)
 *  - depart / arrivee conteneur (Depart/ArriveContainerUseCase)
 *  - livraison (PARCEL_DELIVERED)
 *
 * Centralise ici plutot que dans chaque controller/use-case : un seul point
 * d'emission, impossible d'oublier un chemin. Le client mobile/web invalide
 * alors ses caches (listes + detail) -> mise a jour partout dans l'app.
 *
 * Best-effort : une erreur d'emission ne doit jamais bloquer le flux metier.
 */
async function emitParcelUpdated(event: DomainEvent): Promise<void> {
  try {
    const p = event.payload as Record<string, unknown>;
    const clientId = p.clientId as string | undefined;
    if (!clientId) return;
    realtimeService.toClient(clientId, 'parcel:updated', {
      parcelId: p.parcelId ?? null,
      trackingNumber: p.trackingNumber ?? null,
      // PARCEL_STATUS_CHANGED porte `newStatus` ; les autres events n'ont pas
      // toujours de statut explicite -> on transmet ce qui est dispo.
      status: p.newStatus ?? p.status ?? null,
    });
  } catch (err) {
    logger.warn(`Emission parcel:updated echouee: ${String(err)}`);
  }
}

export function registerRealtimeParcelHandlers(): void {
  eventBus.on(DomainEvents.PARCEL_STATUS_CHANGED, emitParcelUpdated);
  eventBus.on(DomainEvents.PARCEL_LOADED, emitParcelUpdated);
  eventBus.on(DomainEvents.PARCEL_UNLOADED, emitParcelUpdated);
  eventBus.on(DomainEvents.PARCEL_DELIVERED, emitParcelUpdated);
  logger.info('Realtime parcel event handlers registered');
}
