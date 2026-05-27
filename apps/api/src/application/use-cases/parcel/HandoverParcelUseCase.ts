import { inject, injectable } from 'tsyringe';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';
import { StorageChargeService } from '../../services/StorageChargeService';
import { prisma } from '../../../config/database';

interface HandoverInput {
  /** Client qui a recu le colis (peut etre different du recipient enregistre) */
  receivedByClientId: string;
  /** L'agent confirme qu'il a confronte la photo CNI avec la personne en face */
  identityConfirmed: boolean;
  /** Note libre (proof) ; ex : 'Ressemblance OK', 'Procuration verifiée'... */
  note?: string;
  /** URL d'une photo additionnelle (signature, preuve, ...) */
  proofUrl?: string;
}

/**
 * Remise effective d'un colis a un client. Ne se contente pas du status
 * DELIVERED : on enregistre AUSSI un evenement d'historique avec :
 *  - qui a recu (receivedByClientId)
 *  - confirmation d'identite par l'agent
 *  - note + preuve eventuelle
 *
 * Permet la tracabilite si la remise est contestee plus tard.
 */
@injectable()
export class HandoverParcelUseCase {
  constructor(
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    private history: HistoryService,
    private storageCharges: StorageChargeService,
  ) {}

  async execute(parcelId: string, input: HandoverInput, userId: string) {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new NotFoundError('Colis', parcelId);
    if (parcel.status === 'DELIVERED') {
      throw new BusinessError('Ce colis a deja ete remis.');
    }

    const receiver = await prisma.client.findUnique({
      where: { id: input.receivedByClientId },
      select: { id: true, fullName: true },
    });
    if (!receiver) throw new NotFoundError('Client recepteur', input.receivedByClientId);

    if (!input.identityConfirmed) {
      throw new BusinessError(
        'L\'agent doit confirmer avoir confronte l\'identite (photo CNI) avec la personne en face.',
      );
    }

    const updated = await this.parcelRepo.update(parcelId, {
      status: 'DELIVERED',
      pickupDate: new Date(),
      isPresent: false,
      // On note le receveur effectif via la relation recipient (peut differer
      // du recipient initial si quelqu'un d'autre est venu prendre le colis).
      recipient: { connect: { id: receiver.id } },
    });

    // Stop toute charge de magasinage active (le colis quitte le magasin).
    await this.storageCharges.stopActive({
      parcelId,
      reason: 'HANDOVER',
    });

    await this.history.recordParcel({
      parcelId,
      action: 'HANDED_OVER',
      statusBefore: parcel.status,
      statusAfter: 'DELIVERED',
      isPresentAfter: false,
      userId,
      comment: [
        `Remis a ${receiver.fullName}`,
        input.note ? `Note: ${input.note}` : '',
        'Identite confirmee par confrontation photo CNI',
      ]
        .filter(Boolean)
        .join(' | '),
      metadata: {
        receivedByClientId: receiver.id,
        receivedByName: receiver.fullName,
        proofUrl: input.proofUrl ?? null,
        identityConfirmed: true,
      },
    });

    return updated;
  }
}

interface UntrackedHandoverInput {
  agencyId: string;
  warehouseId: string;
  receivedByClientId: string;
  designation: string;
  weight?: number;
  observation?: string;
  identityConfirmed: boolean;
  proofUrl?: string;
}

/**
 * Remise d'un colis trouve physiquement mais absent du systeme :
 * cree le Parcel (status=DELIVERED) avec les donnees minimales, attribue au
 * client receveur, et enregistre l'historique.
 *
 * Tracking number genere a la volee ('UNTRK-<timestamp>-<rand>').
 */
@injectable()
export class HandoverUntrackedParcelUseCase {
  constructor(
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    private history: HistoryService,
  ) {}

  async execute(input: UntrackedHandoverInput, userId: string) {
    if (!input.identityConfirmed) {
      throw new BusinessError(
        'L\'agent doit confirmer avoir confronte l\'identite (photo CNI) avec la personne en face.',
      );
    }
    if (!input.designation?.trim()) {
      throw new BusinessError('Designation obligatoire pour un colis non enregistre.');
    }

    const receiver = await prisma.client.findUnique({
      where: { id: input.receivedByClientId },
    });
    if (!receiver) throw new NotFoundError('Client recepteur', input.receivedByClientId);

    // Le client n'a plus forcement d'agence (Client.agencyId nullable). On
    // utilise l'agence du magasin de retrait comme reference d'organisation
    // et de destination -- c'est la ou le colis a ete trouve physiquement.
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: input.warehouseId },
      include: { agency: { select: { id: true, organizationId: true } } },
    });
    if (!warehouse) throw new NotFoundError('Magasin', input.warehouseId);

    const trackingNumber = `UNTRK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const parcel = await prisma.parcel.create({
      data: {
        organizationId: warehouse.agency.organizationId,
        trackingNumber,
        designation: input.designation.trim(),
        weight: input.weight ?? null,
        destination: warehouse.agency.id,
        observation:
          (input.observation ?? '') +
          ' [Colis trouve physiquement, non enregistre dans le systeme]',
        status: 'DELIVERED',
        isPresent: false,
        pickupDate: new Date(),
        clientId: input.receivedByClientId,
        recipientId: input.receivedByClientId,
        warehouseId: input.warehouseId,
        originalWarehouseId: input.warehouseId,
        price: 0,
      },
    });

    await this.history.recordParcel({
      parcelId: parcel.id,
      action: 'UNTRACKED_HANDED_OVER',
      statusBefore: null,
      statusAfter: 'DELIVERED',
      isPresentAfter: false,
      userId,
      comment: [
        'Colis trouve physiquement, non enregistre dans le systeme',
        `Remis a ${receiver.fullName}`,
        input.observation ? `Observation: ${input.observation}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
      parcelDesignationSnapshot: parcel.designation,
      parcelTrackingSnapshot: parcel.trackingNumber,
      metadata: {
        receivedByClientId: receiver.id,
        receivedByName: receiver.fullName,
        proofUrl: input.proofUrl ?? null,
        identityConfirmed: true,
        untracked: true,
      },
    });

    return parcel;
  }
}
