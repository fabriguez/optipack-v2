import { inject, injectable } from 'tsyringe';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { WAREHOUSE_REPOSITORY, type IWarehouseRepository } from '../../interfaces/IWarehouseRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { prisma } from '../../../config/database';

interface UnloadResult {
  parcelId: string;
  status: 'received' | 'not_found' | 'modified';
  newWeight?: number;
  comment?: string;
}

// Audit fix #3 : statuts conteneur reduits a 5. Le dechargement n'est possible
// qu'en RECEIVED (le conteneur est arrive). Quand tous les colis sont decharges,
// le conteneur passe automatiquement a UNLOADED (terminal, plus reutilisable).
const UNLOAD_ALLOWED_STATUSES = new Set(['RECEIVED']);

@injectable()
export class UnloadParcelUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    @inject(WAREHOUSE_REPOSITORY) private warehouseRepo: IWarehouseRepository,
    private history: HistoryService,
  ) {}

  async execute(
    containerId: string,
    parcelId: string,
    action: 'received' | 'not_found' | 'modified',
    warehouseId: string,
    userId: string,
    options?: { newWeight?: number; comment?: string; spaceId?: string | null },
  ): Promise<UnloadResult> {
    const container = await this.containerRepo.findById(containerId);
    if (!container) throw new NotFoundError('Conteneur', containerId);

    if (!UNLOAD_ALLOWED_STATUSES.has(container.status)) {
      throw new BusinessError(
        `Conteneur ne peut pas etre decharge au statut ${container.status}. Le conteneur doit etre arrive.`,
      );
    }

    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new NotFoundError('Colis', parcelId);

    if (parcel.containerId !== containerId) {
      throw new BusinessError('Ce colis ne fait pas partie de ce conteneur');
    }

    const warehouse = await this.warehouseRepo.findById(warehouseId);
    if (!warehouse) throw new NotFoundError('Magasin', warehouseId);

    // Resolution du space cible (action != not_found uniquement) :
    // - si options.spaceId fourni : on l'utilise (apres verification)
    // - sinon : auto-pick du premier space actif du magasin (par nom)
    let targetSpaceId: string | null = null;
    if (action !== 'not_found') {
      if (options?.spaceId) {
        const sp = await prisma.warehouseSpace.findUnique({
          where: { id: options.spaceId },
        });
        if (!sp) throw new NotFoundError('Space', options.spaceId);
        if (sp.warehouseId !== warehouseId) {
          throw new BusinessError('Le space appartient a un autre magasin.');
        }
        targetSpaceId = sp.id;
      } else {
        const firstSpace = await prisma.warehouseSpace.findFirst({
          where: { warehouseId, isActive: true },
          orderBy: { name: 'asc' },
        });
        targetSpaceId = firstSpace?.id ?? null;
      }
    }

    // Le conteneur reste en RECEIVED tant qu'il y a des colis dedans.
    // Pas d'etat intermediaire UNLOADING (audit fix #3).

    const spaceConnect = targetSpaceId
      ? { space: { connect: { id: targetSpaceId } } }
      : { space: { disconnect: true } };

    // Determine le STATUT FINAL du colis a partir de la destination :
    //  - Si le conteneur arrive a la destination finale du colis
    //    (container.arrivalAgencyId === parcel.destinationAgencyId), alors
    //    le colis est RECEIVED (livre au point d'arrivee final, pret a
    //    etre remis au destinataire).
    //  - Sinon : le colis est juste en transit intermediaire. Il sera
    //    repris dans un conteneur d'acheminement vers sa vraie destination.
    //    Pour distinguer ce cas, on le pose en IN_STOCK (= present au
    //    magasin transit) au lieu de RECEIVED. La page detail colis pourra
    //    afficher "En attente de re-acheminement vers <destination>".
    //
    // Si parcel.destinationAgencyId est NULL (cas legacy ou agence non
    // structuree), on retombe sur RECEIVED par defaut.
    const reachedFinalDestination =
      !parcel.destinationAgencyId ||
      parcel.destinationAgencyId === container.arrivalAgencyId;
    const finalStatus = reachedFinalDestination ? 'RECEIVED' : 'IN_STOCK';

    switch (action) {
      case 'received':
        await this.parcelRepo.update(parcelId, {
          status: finalStatus,
          warehouse: { connect: { id: warehouseId } },
          container: { disconnect: true },
          // Trace l'origine : on memorise le conteneur dont est issu le colis
          // pour pouvoir filtrer "par conteneur d'ou ils ont ete decharges".
          lastContainer: { connect: { id: containerId } },
          // arrivalDate : on l'a vraiment ARRIVE seulement a la destination
          // finale. Sur les transits, on ne le set pas (sera set au prochain
          // dechargement qui atteint la destination).
          ...(reachedFinalDestination && { arrivalDate: new Date() }),
          warehouseEnteredAt: new Date(),
          isPresent: true,
          ...spaceConnect,
        });
        break;

      case 'not_found':
        await this.parcelRepo.update(parcelId, {
          status: 'LOST',
          isPresent: false,
          container: { disconnect: true },
          space: { disconnect: true },
        });
        break;

      case 'modified':
        await this.parcelRepo.update(parcelId, {
          status: finalStatus,
          warehouse: { connect: { id: warehouseId } },
          container: { disconnect: true },
          lastContainer: { connect: { id: containerId } },
          ...(reachedFinalDestination && { arrivalDate: new Date() }),
          warehouseEnteredAt: new Date(),
          isPresent: true,
          ...spaceConnect,
          ...(options?.newWeight && { weight: options.newWeight }),
          ...(options?.comment && { observation: options.comment }),
        });
        break;
    }

    const parcelWeight = parcel.weight ? Number(parcel.weight) : 0;
    const newLoad = Math.max(0, Number(container.currentLoad) - parcelWeight);

    // Apres dechargement : si plus aucun colis dans le conteneur, on passe en UNLOADED (terminal).
    const remaining = await this.parcelRepo.findByContainer(containerId);
    const isLastParcel = remaining.length === 0;

    await this.containerRepo.update(containerId, {
      currentLoad: newLoad,
      ...(isLastParcel && { status: 'UNLOADED' }),
    });

    // Trace par colis dans l'historique du conteneur (chaque dechargement).
    await this.history.recordContainer({
      containerId,
      action: `PARCEL_UNLOADED_${action.toUpperCase()}`,
      statusBefore: container.status,
      statusAfter: container.status,
      userId,
      comment: `Colis ${parcel.trackingNumber} - ${parcel.designation}${options?.comment ? ` (${options.comment})` : ''}`,
      changes: {
        parcelId,
        trackingNumber: parcel.trackingNumber,
        designation: parcel.designation,
        action,
        warehouseId: action === 'not_found' ? null : warehouseId,
        ...(options?.newWeight && { newWeight: options.newWeight, previousWeight: parcelWeight }),
      },
    });

    if (isLastParcel) {
      await this.history.recordContainer({
        containerId,
        action: 'UNLOADED',
        statusBefore: 'RECEIVED',
        statusAfter: 'UNLOADED',
        userId,
        comment: 'Tous les colis ont ete decharges. Conteneur cloture.',
      });
    }

    await this.history.recordParcel({
      parcelId,
      action: `UNLOADED_${action.toUpperCase()}`,
      statusBefore: parcel.status,
      statusAfter: action === 'not_found' ? 'LOST' : 'RECEIVED',
      isPresentAfter: action !== 'not_found',
      containerId,
      warehouseId: action === 'not_found' ? null : warehouseId,
      userId,
      comment: options?.comment ?? null,
      parcelDesignationSnapshot: parcel.designation,
      parcelTrackingSnapshot: parcel.trackingNumber,
      metadata: options?.newWeight ? { newWeight: options.newWeight, previousWeight: parcelWeight } : null,
    });

    // Emit parcel unloaded event for notifications (client + agency)
    try {
      eventBus.emit({
        type: DomainEvents.PARCEL_UNLOADED,
        payload: {
          parcelId,
          action,
          containerId,
          trackingNumber: parcel.trackingNumber,
          clientId: parcel.clientId,
          agencyId: container.arrivalAgencyId,
        },
        timestamp: new Date(),
        userId,
      });
    } catch (e) {
      // non blocking
    }

    return {
      parcelId,
      status: action,
      newWeight: options?.newWeight,
      comment: options?.comment,
    };
  }
}
