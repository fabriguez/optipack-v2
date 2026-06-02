import { injectable } from 'tsyringe';
import { generateReference } from '@transitsoftservices/shared';
import { prisma } from '../../config/database';
import { eventBus, DomainEvents } from '../../infrastructure/events/EventBus';
import { LoyaltyConfigService } from './LoyaltyConfigService';
import { StorageChargeService } from './StorageChargeService';
import { GroupInvoiceService } from './GroupInvoiceService';

function tierFor(
  points: number,
  thresholds: { SILVER: number; GOLD: number; VIP: number },
): 'STANDARD' | 'SILVER' | 'GOLD' | 'VIP' {
  if (points >= thresholds.VIP) return 'VIP';
  if (points >= thresholds.GOLD) return 'GOLD';
  if (points >= thresholds.SILVER) return 'SILVER';
  return 'STANDARD';
}

/**
 * Reglement d'un paiement EN LIGNE (Mobile Money / carte via le portail client).
 *
 * Contrairement a RecordPaymentUseCase (encaissement agent au guichet), ce
 * service :
 *  - ne credite PAS la caisse physique de l'agence (les fonds arrivent sur le
 *    compte du provider, pas dans le tiroir) ;
 *  - ne genere PAS d'ecriture au journal de caisse (rapprochement bancaire des
 *    encaissements en ligne traite separement) ;
 *  - cree un Payment avec receivedByUserId = null (aucun agent encaisseur).
 *
 * Il reste idempotent : declenche sur succes d'un PaymentIntent (webhook ou
 * succes synchrone), il ne cree le Payment qu'une seule fois grace au verrou
 * PaymentIntent.paymentId (unique). RecordPaymentUseCase (flux admin) n'est pas
 * touche et continue de fonctionner a l'identique.
 */
@injectable()
export class OnlinePaymentSettlementService {
  constructor(
    private loyaltyConfig: LoyaltyConfigService,
    private storageCharges: StorageChargeService,
    private groupInvoice: GroupInvoiceService,
  ) {}

  /**
   * Solde la facture liee a un PaymentIntent SUCCEEDED. No-op si l'intent n'est
   * pas en succes, ou s'il a deja ete regle (paymentId present).
   * Retourne { paymentId, alreadySettled } ou null si rien a faire.
   */
  async settleSucceededIntent(
    intentId: string,
  ): Promise<{ paymentId: string; alreadySettled: boolean } | null> {
    const intent = await prisma.paymentIntent.findUnique({
      where: { id: intentId },
    });
    if (!intent || intent.status !== 'SUCCEEDED') return null;
    if (intent.paymentId) {
      return { paymentId: intent.paymentId, alreadySettled: true };
    }

    // Verrou atomique : un seul appelant pose settledAt. Si un webhook et un
    // polling arrivent en meme temps, le perdant a count === 0 et s'arrete.
    const claim = await prisma.paymentIntent.updateMany({
      where: { id: intentId, status: 'SUCCEEDED', settledAt: null },
      data: { settledAt: new Date() },
    });
    if (claim.count === 0) {
      const cur = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
      return cur?.paymentId ? { paymentId: cur.paymentId, alreadySettled: true } : null;
    }

    try {
      return await this.runSettlement(intent);
    } catch (err) {
      // Echec : on relache le verrou pour permettre un nouvel essai (poll / retry).
      await prisma.paymentIntent
        .update({ where: { id: intentId }, data: { settledAt: null } })
        .catch(() => undefined);
      throw err;
    }
  }

  private async runSettlement(
    intent: { id: string; channel: string; externalRef: string | null; invoiceId: string; amount: unknown; organizationId: string },
  ): Promise<{ paymentId: string; alreadySettled: boolean } | null> {
    const method = intent.channel === 'CARD' ? 'CARD' : intent.channel; // MOBILE_MONEY, USSD, ...
    const txRef = intent.externalRef ?? null;

    const invoice = await prisma.invoice.findUnique({
      where: { id: intent.invoiceId },
      select: { id: true, parcelGroupId: true },
    });
    if (!invoice) return null;

    let primaryPaymentId: string | null = null;

    if (invoice.parcelGroupId) {
      // Facture agregat de groupe : on distribue le montant sur les factures
      // membres non soldees, proportionnellement a leur solde (meme regle que
      // l'encaissement agent), puis on resynchronise l'agregat.
      const splits = await this.groupInvoice.splitAmountAcrossMembers(
        invoice.parcelGroupId,
        Number(intent.amount),
      );
      for (const s of splits) {
        const p = await this.applyToInvoice(s.invoiceId, s.amount, method, txRef, intent.organizationId);
        if (p && !primaryPaymentId) primaryPaymentId = p;
      }
      await this.groupInvoice.sync(invoice.parcelGroupId);
    } else {
      primaryPaymentId = await this.applyToInvoice(
        intent.invoiceId,
        Number(intent.amount),
        method,
        txRef,
        intent.organizationId,
      );
    }

    if (!primaryPaymentId) return null;

    // Verrou d'idempotence : lie l'intent au Payment. Si un autre appel
    // concurrent a deja pose le lien, on ignore l'erreur d'unicite.
    try {
      await prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { paymentId: primaryPaymentId },
      });
    } catch {
      /* deja lie par un appel concurrent : no-op */
    }

    return { paymentId: primaryPaymentId, alreadySettled: false };
  }

  /**
   * Cree le Payment (ledger immuable, receivedByUserId null) et met a jour la
   * facture (paidAmount / balance / status), gele les frais de magasinage en
   * phase DEPARTURE, attribue la fidelite, et emet les evenements metier.
   * Retourne l'id du Payment, ou null si la facture est introuvable / soldee.
   */
  private async applyToInvoice(
    invoiceId: string,
    amount: number,
    method: string,
    txRef: string | null,
    organizationId: string,
  ): Promise<string | null> {
    if (amount <= 0) return null;
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return null;
    if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') return null;

    // On borne le montant au solde restant (securite : un provider ne devrait
    // jamais encaisser plus que du). Tout surplus eventuel est ignore ici.
    const balance = Number(invoice.balance);
    const applied = Math.min(amount, balance);
    if (applied <= 0) return null;

    // Reference race-safe (meme strategie que RecordPaymentUseCase).
    const baseData = {
      amount: applied,
      paymentMethod: method,
      transactionReference: txRef,
      invoice: { connect: { id: invoice.id } },
      agency: { connect: { id: invoice.agencyId } },
      // receivedBy volontairement absent : paiement en ligne, pas d'agent.
    };
    let baseCount = await this.countTodayPayments(invoice.agencyId);
    let payment: { id: string } | undefined;
    let reference = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      reference = generateReference('PAY', baseCount + 1 + attempt);
      try {
        payment = await prisma.payment.create({ data: { reference, ...baseData } });
        break;
      } catch (err: unknown) {
        if ((err as { code?: string })?.code !== 'P2002') throw err;
        baseCount = await this.countTodayPayments(invoice.agencyId);
      }
    }
    if (!payment) {
      reference = `${generateReference('PAY', baseCount + 1)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      payment = await prisma.payment.create({ data: { reference, ...baseData } });
    }

    // Mise a jour facture
    const newPaidAmount = Number(invoice.paidAmount) + applied;
    const newBalance = Number(invoice.netAmount) - newPaidAmount;
    const newStatus = newBalance <= 0 ? 'PAID' : 'PARTIAL';
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { paidAmount: newPaidAmount, balance: Math.max(0, newBalance), status: newStatus },
    });

    // Gel des frais de magasinage DEPARTURE (le paiement arrete l'accumulation
    // au depart, comme pour l'encaissement agent).
    const invoiceParcels = await prisma.parcel.findMany({
      where: { invoiceId: invoice.id, isDeleted: false },
      select: { id: true },
    });
    for (const p of invoiceParcels) {
      const activeDeparture = await prisma.parcelStorageCharge.findFirst({
        where: { parcelId: p.id, stoppedAt: null, phase: 'DEPARTURE' },
      });
      if (activeDeparture) {
        await this.storageCharges.stopActive({
          parcelId: p.id,
          warehouseId: activeDeparture.warehouseId,
          reason: 'PAYMENT',
        });
      }
    }

    // Fidelite + totalSpent (parite avec l'encaissement agent).
    if (invoice.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: invoice.clientId },
        select: { loyaltyPoints: true, loyaltyTier: true, organizationId: true },
      });
      if (client) {
        const cfg = await this.loyaltyConfig.get(client.organizationId);
        const earned = cfg.enabled ? Math.floor(applied * cfg.pointsPerXaf) : 0;
        if (cfg.enabled && earned > 0) {
          const newPoints = client.loyaltyPoints + earned;
          const newTier = tierFor(newPoints, cfg.tierThresholds);
          await prisma.$transaction([
            prisma.client.update({
              where: { id: invoice.clientId },
              data: {
                loyaltyPoints: newPoints,
                loyaltyTier: newTier,
                totalSpent: { increment: applied },
              },
            }),
            prisma.loyaltyTransaction.create({
              data: {
                clientId: invoice.clientId,
                points: earned,
                type: 'EARN',
                source: `payment:${payment.id}`,
                description: `Paiement en ligne ${reference} - +${earned} pts`,
              },
            }),
          ]);
        } else {
          await prisma.client.update({
            where: { id: invoice.clientId },
            data: { totalSpent: { increment: applied } },
          });
        }
      }
    }

    // Evenements (mails/SMS "Paiement recu" + "Facture reglee").
    const agency = await prisma.agency.findUnique({
      where: { id: invoice.agencyId },
      select: { name: true },
    });
    eventBus.emit({
      type: DomainEvents.PAYMENT_RECEIVED,
      payload: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        agencyId: invoice.agencyId,
        amount: applied,
        newInvoiceStatus: newStatus,
        clientId: invoice.clientId,
        organizationId,
        invoiceRef: invoice.reference,
        paymentMethod: method,
        remainingBalance: Math.max(0, newBalance),
        agencyName: agency?.name ?? '',
      },
      timestamp: new Date(),
      userId: undefined,
    });
    if (newStatus === 'PAID') {
      eventBus.emit({
        type: DomainEvents.INVOICE_PAID,
        payload: {
          invoiceId: invoice.id,
          reference: invoice.reference,
          clientId: invoice.clientId,
          agencyId: invoice.agencyId,
          organizationId,
          totalAmount: invoice.netAmount,
          currency: (invoice as { currency?: string }).currency ?? 'XAF',
        },
        timestamp: new Date(),
        userId: undefined,
      });
    }

    return payment.id;
  }

  /** Compte les paiements du jour pour une agence (base de la reference PAY). */
  private async countTodayPayments(agencyId: string): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return prisma.payment.count({
      where: { agencyId, createdAt: { gte: start, lt: end } },
    });
  }
}
