import { injectable, inject } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';

interface Input {
  // Champs metiers d'un colis complet
  designation: string;
  weight?: number | null;
  volume?: number | null;
  category?: 'STANDARD' | 'DOCUMENT' | 'FOOD' | 'ELECTRONICS' | 'CLOTHING' | 'OTHER';
  isFragile?: boolean;
  isHazardous?: boolean;
  declaredValue?: number | null;
  observation?: string | null;
  trackingFournisseur?: string | null;
  // Client obligatoire (le colis doit appartenir a quelqu'un)
  clientId: string;
  recipientId?: string | null;
  // Magasin physique ou se trouve le colis (typiquement l'agence d'arrivee
  // du conteneur). Necessaire pour permettre le suivi.
  warehouseId: string;
  // Adresse de destination (optionnelle, surcharge la ville d'agence)
  destinationAddress?: string | null;
  destinationAgencyId?: string | null;
}

/**
 * Lors de la comparaison du bordereau de reception, un colis est trouve
 * PHYSIQUEMENT dans le conteneur mais n'existe pas en ligne. Cet use case
 * cree un Parcel complet en stock dans le magasin de reception, le rattache
 * au conteneur (containerId + lastContainerId), et cree une ManifestDiscrepancy
 * EXTRA_PHYSICAL pour audit.
 *
 * Le colis est cree avec status=RECEIVED + isPresent=true (il vient d'arriver
 * physiquement) et price=0 (pas de tarification automatique : un colis non
 * enregistre n'a pas de route ni de tarif partenaire ; un agent devra
 * regulariser ulterieurement si besoin).
 */
@injectable()
export class RegisterExtraManifestParcelUseCase {
  constructor(@inject(HistoryService) private history: HistoryService) {}

  async execute(containerId: string, input: Input, userId: string) {
    if (!input.designation?.trim()) throw new BusinessError('Designation obligatoire');

    const container = await prisma.container.findUnique({
      where: { id: containerId },
      include: { arrivalAgency: true },
    });
    if (!container) throw new NotFoundError('Conteneur', containerId);

    // Le conteneur doit etre arrive pour qu'un "extra physique" ait du sens
    // (sinon on est en chargement, donc on ajouterait un colis normalement).
    const allowed = ['RECEIVED', 'UNLOADED'];
    if (!allowed.includes(container.status)) {
      throw new BusinessError(
        `Enregistrer un colis trouve physiquement n'est applicable qu'a un conteneur receptionne (statut actuel : ${container.status}).`,
      );
    }

    const client = await prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw new NotFoundError('Client', input.clientId);

    const warehouse = await prisma.warehouse.findUnique({
      where: { id: input.warehouseId },
      include: { agency: true },
    });
    if (!warehouse) throw new NotFoundError('Magasin', input.warehouseId);

    // Destination logique : agence d'arrivee du conteneur (ou celle fournie).
    const destAgencyId = input.destinationAgencyId ?? container.arrivalAgencyId;
    const destAgency = await prisma.agency.findUnique({ where: { id: destAgencyId } });
    if (!destAgency) throw new NotFoundError('Agence destination', destAgencyId);

    const trackingNumber = `EXTRA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Meme regle que UnloadParcelUseCase : RECEIVED seulement si le colis est
    // decharge a son agence de destination finale. Un extra trouve dans un
    // conteneur en transit intermediaire (destination fournie != agence
    // d'arrivee) est en attente de re-acheminement -> IN_STOCK.
    const reachedFinalDestination = destAgency.id === container.arrivalAgencyId;
    const finalStatus = reachedFinalDestination ? 'RECEIVED' : 'IN_STOCK';

    const parcel = await prisma.parcel.create({
      data: {
        organizationId: warehouse.agency.organizationId,
        trackingNumber,
        trackingFournisseur: input.trackingFournisseur ?? null,
        designation: input.designation.trim(),
        weight: input.weight ?? null,
        originalWeight: input.weight ?? null,
        volume: input.volume ?? null,
        destination: destAgency.city,
        destinationAgencyId: destAgency.id,
        destinationAddress: input.destinationAddress ?? null,
        category: (input.category as never) ?? 'STANDARD',
        isFragile: input.isFragile ?? false,
        isHazardous: input.isHazardous ?? false,
        declaredValue: input.declaredValue ?? null,
        observation:
          (input.observation ?? '') +
          ' [Colis trouve physiquement dans le conteneur, non enregistre prealablement]',
        status: finalStatus,
        isPresent: true,
        clientId: input.clientId,
        recipientId: input.recipientId ?? null,
        warehouseId: warehouse.id,
        originalWarehouseId: warehouse.id,
        warehouseEnteredAt: new Date(),
        // Lien conteneur : current=null (deja decharge logiquement) + lastContainerId
        // pour conserver la trace de provenance dans toutes les listes.
        lastContainerId: containerId,
        price: 0,
      },
    });

    // Audit : on cree aussi une ManifestDiscrepancy(EXTRA_PHYSICAL) liee au
    // nouveau colis, pour qu'il apparaisse dans le bordereau de comparaison.
    await prisma.manifestDiscrepancy.create({
      data: {
        containerId,
        parcelId: parcel.id,
        type: 'EXTRA_PHYSICAL',
        designation: parcel.designation,
        trackingNumber: parcel.trackingNumber,
        weight: parcel.weight,
        comment: 'Colis trouve physiquement et enregistre comme nouveau',
        markedByUserId: userId,
      },
    });

    await this.history.recordParcel({
      parcelId: parcel.id,
      action: 'REGISTERED_AS_EXTRA',
      statusBefore: null,
      statusAfter: finalStatus,
      isPresentAfter: true,
      warehouseId: warehouse.id,
      userId,
      comment: 'Colis trouve physiquement dans le conteneur et enregistre',
      parcelDesignationSnapshot: parcel.designation,
      parcelTrackingSnapshot: parcel.trackingNumber,
      metadata: { containerId, clientId: input.clientId },
    });

    return parcel;
  }
}
