import { inject, injectable } from 'tsyringe';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';
import { StorageChargeService } from '../../services/StorageChargeService';
import { DebtBlockConfigService } from '../../services/DebtBlockConfigService';
import { prisma } from '../../../config/database';
import { generateReference } from '@transitsoftservices/shared';

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
    private debtBlockConfig: DebtBlockConfigService,
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

    // Regle metier : le colis ne peut etre remis qu'a son emetteur (client)
    // ou a son destinataire (recipient) enregistre. Pas de tiers.
    const allowed = new Set<string>();
    if (parcel.clientId) allowed.add(parcel.clientId);
    if (parcel.recipientId) allowed.add(parcel.recipientId);
    if (allowed.size > 0 && !allowed.has(input.receivedByClientId)) {
      throw new BusinessError(
        'Le recepteur doit etre l\'emetteur ou le destinataire enregistre sur ce colis.',
      );
    }

    // Blocage si client emetteur a un cumul de dettes CLIENT actives au-dela
    // du seuil configure via DebtBlockConfigService (auto-seed defaults).
    if (parcel.clientId) {
      const warehouseAgency = parcel.warehouseId
        ? await prisma.warehouse.findUnique({
            where: { id: parcel.warehouseId },
            select: { agency: { select: { organizationId: true } } },
          })
        : null;
      const organizationId = warehouseAgency?.agency?.organizationId;
      if (organizationId) {
        const cfg = await this.debtBlockConfig.get(organizationId);
        if (cfg.handoverEnabled) {
          const agg = await prisma.debt.aggregate({
            where: {
              clientId: parcel.clientId,
              type: 'CLIENT',
              status: { notIn: ['CLEARED' as never, 'CANCELLED' as never] },
              // Exclut la facture du colis courant : sinon le client ne pourra
              // jamais retirer si la dette auto-creee a la remise se cumule.
              ...(parcel.invoiceId && { invoiceId: { not: parcel.invoiceId } }),
            },
            _sum: { remainingAmount: true },
          });
          const cumul = Number(agg._sum.remainingAmount ?? 0);
          if (cumul > cfg.handoverThreshold) {
            throw new BusinessError(
              `Retrait bloque : ${receiver.fullName} a un cumul de dettes impayees de ${cumul} (seuil ${cfg.handoverThreshold}). Apurer la dette avant la remise.`,
            );
          }
        }
      }
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

    // Auto-creation d'une dette CLIENT si la facture liee a un solde
    // restant. Le colis a ete remis sans paiement complet : on materialise
    // l'engagement de paiement du client via une Debt (type CLIENT, motif
    // "Colis remis sans paiement complet"). Idempotent : skip si une dette
    // active existe deja pour cette facture.
    let createdDebt: { id: string; reference: string; amount: number } | null = null;
    if (parcel.invoiceId) {
      try {
        const invoice = await prisma.invoice.findUnique({
          where: { id: parcel.invoiceId },
          select: {
            id: true, reference: true, balance: true, status: true,
            agencyId: true, clientId: true,
            agency: { select: { organizationId: true } },
          },
        });
        const remainingBalance = invoice ? Number(invoice.balance) : 0;
        const shouldCreate =
          invoice &&
          remainingBalance > 0 &&
          invoice.status !== 'CANCELLED' &&
          invoice.status !== 'PAID';
        if (shouldCreate) {
          const existingDebt = await prisma.debt.findFirst({
            where: {
              invoiceId: invoice.id,
              type: 'CLIENT',
              status: { notIn: ['CANCELLED' as never, 'CLEARED' as never] },
            },
          });
          if (!existingDebt) {
            const reference = generateReference('DET', Date.now());
            const debt = await prisma.$transaction(async (tx) => {
              const created = await tx.debt.create({
                data: {
                  reference,
                  organizationId: invoice.agency.organizationId,
                  agencyId: invoice.agencyId,
                  type: 'CLIENT',
                  motif: `Colis ${parcel.trackingNumber} remis sans paiement complet`,
                  description: `Facture ${invoice.reference} : solde ${remainingBalance} restant a payer au moment de la remise du colis.`,
                  totalAmount: remainingBalance,
                  paidAmount: 0,
                  remainingAmount: remainingBalance,
                  clientId: invoice.clientId,
                  parcelId: parcel.id,
                  invoiceId: invoice.id,
                  createdByUserId: userId,
                },
              });
              await tx.debtHistory.create({
                data: {
                  debtId: created.id,
                  action: 'CREATED',
                  changes: {
                    type: 'CLIENT',
                    totalAmount: remainingBalance,
                    motif: created.motif,
                    source: 'HANDOVER',
                    parcelId: parcel.id,
                    invoiceId: invoice.id,
                  },
                  comment: 'Cree automatiquement a la remise du colis (solde facture impaye).',
                  userId,
                },
              });
              return created;
            });
            createdDebt = { id: debt.id, reference: debt.reference, amount: remainingBalance };
          }
        }
      } catch (err) {
        // Non bloquant : remise reussit meme si la dette echoue.
        try {
          await this.history.recordParcel({
            parcelId,
            action: 'DEBT_AUTO_CREATE_FAILED',
            userId,
            parcelDesignationSnapshot: parcel.designation,
            parcelTrackingSnapshot: parcel.trackingNumber,
            comment: 'Echec creation auto dette a la remise',
            metadata: { error: err instanceof Error ? err.message : String(err) },
          });
        } catch { /* skip */ }
      }
    }

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
        createdDebt ? `Dette ${createdDebt.reference} creee (${createdDebt.amount})` : '',
        'Identite confirmee par confrontation photo CNI',
      ]
        .filter(Boolean)
        .join(' | '),
      metadata: {
        receivedByClientId: receiver.id,
        receivedByName: receiver.fullName,
        proofUrl: input.proofUrl ?? null,
        identityConfirmed: true,
        autoDebtId: createdDebt?.id ?? null,
        autoDebtReference: createdDebt?.reference ?? null,
        autoDebtAmount: createdDebt?.amount ?? null,
      },
    });

    return { ...updated, autoDebt: createdDebt };
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
