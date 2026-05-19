import { inject, injectable } from 'tsyringe';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';
import { prisma } from '../../../config/database';

export interface UpdateParcelInput {
  designation?: string;
  trackingFournisseur?: string | null;
  weight?: number | null;
  volume?: number | null;
  // destination est derive automatiquement depuis destinationAgencyId : on
  // n'expose plus de champ libre. Pour modifier la ville d'arrivee, il faut
  // changer l'agence de destination.
  destinationAgencyId?: string;
  destinationAddress?: string | null;
  observation?: string | null;
  imageUrl?: string | null;
  recipientId?: string | null;
  warehouseId?: string | null;
  transitRouteId?: string;
}

const EDITABLE_STATUSES = new Set(['IN_STOCK', 'ARRIVED', 'RECEIVED']);

@injectable()
export class UpdateParcelUseCase {
  constructor(
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    private history: HistoryService,
  ) {}

  async execute(parcelId: string, input: UpdateParcelInput, userId: string) {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new NotFoundError('Colis', parcelId);

    if (!EDITABLE_STATUSES.has(parcel.status)) {
      throw new BusinessError(
        `Le colis ne peut pas etre modifie au statut ${parcel.status}. Seuls les colis en stock, arrives ou receptionnes sont modifiables.`,
      );
    }

    // Validation stricte selon le type de la route (current ou nouvelle si
    // l'update la change). AIR -> masse seule, SEA -> volume seul, LAND ->
    // les deux. On force a null le champ non pertinent pour aligner DB.
    const routeId = input.transitRouteId ?? parcel.transitRouteId;
    let routeType: 'AIR' | 'SEA' | 'LAND' | null = null;
    if (routeId) {
      const route = await prisma.transitRoute.findUnique({
        where: { id: routeId },
        select: { type: true },
      });
      routeType = (route?.type ?? null) as typeof routeType;
    }

    const finalWeight = input.weight !== undefined ? input.weight : parcel.weight ? Number(parcel.weight) : null;
    const finalVolume = input.volume !== undefined ? input.volume : parcel.volume ? Number(parcel.volume) : null;
    const hasMass = finalWeight !== null && Number(finalWeight) > 0;
    const hasVol = finalVolume !== null && Number(finalVolume) > 0;

    if (routeType === 'AIR') {
      if (!hasMass) throw new BusinessError('Route aerienne : la masse est obligatoire.');
      // Force volume a null
      if (input.volume !== undefined ? input.volume !== null : parcel.volume !== null) {
        input.volume = null;
      }
    } else if (routeType === 'SEA') {
      if (!hasVol) throw new BusinessError('Route maritime : le volume est obligatoire.');
      if (input.weight !== undefined ? input.weight !== null : parcel.weight !== null) {
        input.weight = null;
      }
    } else if (routeType === 'LAND') {
      if (!hasMass || !hasVol) throw new BusinessError('Route terrestre : masse et volume obligatoires.');
    } else if (!hasMass && !hasVol) {
      throw new BusinessError('Le colis doit conserver une masse ou un volume');
    }

    const data: Record<string, any> = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    if (input.designation !== undefined && input.designation !== parcel.designation) {
      data.designation = input.designation;
      changes.designation = { from: parcel.designation, to: input.designation };
    }
    if (input.weight !== undefined) {
      data.weight = input.weight;
      changes.weight = { from: parcel.weight, to: input.weight };
    }
    if (input.volume !== undefined) {
      data.volume = input.volume;
      changes.volume = { from: parcel.volume, to: input.volume };
    }
    if (input.trackingFournisseur !== undefined) {
      const next = input.trackingFournisseur || null;
      if (next !== (parcel as any).trackingFournisseur) {
        data.trackingFournisseur = next;
        changes.trackingFournisseur = { from: (parcel as any).trackingFournisseur, to: next };
      }
    }
    if (input.destinationAgencyId !== undefined && input.destinationAgencyId !== parcel.destinationAgencyId) {
      const agency = await prisma.agency.findUnique({
        where: { id: input.destinationAgencyId },
        select: { id: true, city: true },
      });
      if (!agency) throw new NotFoundError('Agence de destination', input.destinationAgencyId);
      data.destinationAgency = { connect: { id: agency.id } };
      data.destination = agency.city;
      changes.destinationAgencyId = { from: parcel.destinationAgencyId, to: agency.id };
      if (agency.city !== parcel.destination) {
        changes.destination = { from: parcel.destination, to: agency.city };
      }
    }
    if (input.destinationAddress !== undefined && input.destinationAddress !== parcel.destinationAddress) {
      data.destinationAddress = input.destinationAddress;
      changes.destinationAddress = { from: parcel.destinationAddress, to: input.destinationAddress };
    }
    if (input.observation !== undefined) {
      data.observation = input.observation;
      changes.observation = { from: parcel.observation, to: input.observation };
    }
    if (input.imageUrl !== undefined) {
      data.imageUrl = input.imageUrl;
      changes.imageUrl = { from: parcel.imageUrl, to: input.imageUrl };
    }
    if (input.recipientId !== undefined) {
      data.recipient = input.recipientId
        ? { connect: { id: input.recipientId } }
        : { disconnect: true };
      changes.recipientId = { from: parcel.recipientId, to: input.recipientId };
    }
    if (input.warehouseId !== undefined && input.warehouseId !== parcel.warehouseId) {
      data.warehouse = input.warehouseId
        ? { connect: { id: input.warehouseId } }
        : { disconnect: true };
      data.warehouseEnteredAt = input.warehouseId ? new Date() : null;
      changes.warehouseId = { from: parcel.warehouseId, to: input.warehouseId };
    }
    if (input.transitRouteId !== undefined && input.transitRouteId !== parcel.transitRouteId) {
      data.transitRoute = { connect: { id: input.transitRouteId } };
      changes.transitRouteId = { from: parcel.transitRouteId, to: input.transitRouteId };
    }

    if (Object.keys(data).length === 0) {
      return parcel;
    }

    const updated = await this.parcelRepo.update(parcelId, data);

    await this.history.recordParcel({
      parcelId,
      action: 'UPDATED',
      statusBefore: parcel.status,
      statusAfter: parcel.status,
      warehouseId: data.warehouse ? input.warehouseId ?? null : parcel.warehouseId,
      userId,
      parcelDesignationSnapshot: updated.designation,
      parcelTrackingSnapshot: parcel.trackingNumber,
      comment: 'Modification des informations du colis',
      metadata: { changes },
    });

    return updated;
  }
}
