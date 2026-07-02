import { injectable } from 'tsyringe';
import type { Prisma } from '@prisma/client';
import { generateReference } from '@transitsoftservices/shared';
import { prisma } from '../../config/database';
import { eventBus, DomainEvents } from '../../infrastructure/events/EventBus';
import { LoyaltyConfigService } from './LoyaltyConfigService';
import { StorageChargeService } from './StorageChargeService';
import { GroupInvoiceService } from './GroupInvoiceService';

/** Client de transaction interactive Prisma (writes du chemin critique). */
type Tx = Prisma.TransactionClient;

/**
 * Tente d'extraire, de facon best-effort, le montant reellement encaisse par le
 * provider a partir du payload brut stocke sur la tentative reussie. Les
 * providers exposent ce montant sous des clefs variees (amount, amount_total,
 * paidAmount, ...). Retourne null si aucun montant exploitable n'est present
 * (le provider n'a rien rapporte) : dans ce cas on ne bloque pas le reglement.
 */
function extractReportedPaidAmount(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  // Certains providers nichent la transaction sous `data`.
  const data = (root.data && typeof root.data === 'object' ? root.data : {}) as Record<string, unknown>;
  const candidates = [
    root.amount,
    root.amount_total,
    root.amountPaid,
    root.paidAmount,
    root.paid_amount,
    root.total,
    data.amount,
    data.amount_total,
    data.paidAmount,
    data.paid_amount,
    data.total,
  ];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c;
    if (typeof c === 'string') {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

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

    // RECONCILIATION MONTANT (integrite financiere) : avant de solder, on
    // verifie que le montant reellement encaisse par le provider correspond au
    // montant attendu de l'intent. On lit le payload brut de la derniere
    // tentative reussie (best-effort : les providers ne rapportent pas tous un
    // montant). Si un montant est rapporte ET qu'il est inferieur a
    // intent.amount, on N'ecrit RIEN : on laisse en revue manuelle plutot que
    // de solder une facture qui n'a pas ete integralement payee. Le credit
    // reel utilise TOUJOURS intent.amount (montant serveur), jamais un montant
    // fourni par le client.
    const succeededAttempt = await prisma.paymentAttempt.findFirst({
      where: { intentId, status: 'SUCCEEDED' },
      orderBy: { finishedAt: 'desc' },
      select: { providerPayload: true },
    });
    const reportedPaid = extractReportedPaidAmount(succeededAttempt?.providerPayload);
    if (reportedPaid !== null && !this.reportedCoversIntent(reportedPaid, Number(intent.amount))) {
      // Encaissement partiel / incoherent : on ne solde pas automatiquement.
      // Le verrou settledAt n'a pas encore ete pose, donc rien a relacher.
      console.warn(
        `[settlement] intent ${intentId}: montant provider (${reportedPaid}) < montant attendu (${Number(
          intent.amount,
        )}). Reglement suspendu pour revue manuelle.`,
      );
      return null;
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

    // Facture agregat de groupe : on distribue le montant sur les factures
    // membres non soldees, proportionnellement a leur solde (meme regle que
    // l'encaissement agent). Le split est un pur calcul (lecture) : on le fait
    // AVANT d'ouvrir la transaction pour garder la section critique courte.
    const targets = invoice.parcelGroupId
      ? await this.groupInvoice.splitAmountAcrossMembers(invoice.parcelGroupId, Number(intent.amount))
      : [{ invoiceId: intent.invoiceId, amount: Number(intent.amount) }];

    // SECTION CRITIQUE ATOMIQUE (integrite financiere) : creation des Payment,
    // mise a jour des factures ET pose du verrou d'idempotence
    // intent.paymentId, le TOUT dans une seule transaction interactive. Si quoi
    // que ce soit echoue, rien n'est committe : un retry ne peut donc PAS creer
    // un second Payment pour le meme intent (pas de double-credit). Le lien
    // intent.paymentId est ecrit dans la MEME transaction que le Payment : un
    // appel concurrent/retry qui a deja committe le verra deja pose (garde en
    // tete de settleSucceededIntent) ou echouera sur la contrainte unique.
    const effects: SettlementEffect[] = [];
    let primaryPaymentId: string | null = null;

    await prisma.$transaction(async (tx) => {
      for (const t of targets) {
        const eff = await this.applyToInvoiceTx(tx, t.invoiceId, t.amount, method, txRef);
        if (!eff) continue;
        effects.push(eff);
        if (!primaryPaymentId) primaryPaymentId = eff.paymentId;
      }

      if (!primaryPaymentId) {
        // Rien n'a ete applique (factures deja soldees / annulees) : on annule
        // la transaction pour ne rien ecrire et ne pas poser de verrou.
        throw new NoSettlementApplied();
      }

      // Verrou d'idempotence, atomique avec les Payment : lie l'intent au
      // Payment principal. En cas de course, l'un des deux echoue ici sur la
      // contrainte unique de paymentId et toute la transaction est annulee.
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: { paymentId: primaryPaymentId },
      });
    }).catch((err) => {
      if (err instanceof NoSettlementApplied) return; // no-op volontaire
      throw err;
    });

    if (!primaryPaymentId) return null;

    // EFFETS POST-COMMIT (non financiers / idempotents) : gel magasinage,
    // fidelite, resync agregat de groupe, evenements. Executes APRES le commit
    // de la section critique. Ils ne participent pas au double-credit et
    // s'appuient sur des services externes utilisant le client prisma global.
    for (const eff of effects) {
      await this.runPostSettlementEffects(eff, method, intent.organizationId);
    }
    if (invoice.parcelGroupId) {
      await this.groupInvoice.sync(invoice.parcelGroupId);
    }

    return { paymentId: primaryPaymentId, alreadySettled: false };
  }

  /**
   * SECTION CRITIQUE : cree le Payment (ledger immuable, receivedByUserId null)
   * et met a jour la facture (paidAmount / balance / status) via le client de
   * transaction `tx`. Retourne un descripteur d'effets a rejouer apres commit,
   * ou null si la facture est introuvable / soldee / montant nul.
   */
  private async applyToInvoiceTx(
    tx: Tx,
    invoiceId: string,
    amount: number,
    method: string,
    txRef: string | null,
  ): Promise<SettlementEffect | null> {
    if (amount <= 0) return null;
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
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
    let baseCount = await this.countTodayPayments(tx, invoice.agencyId);
    let payment: { id: string } | undefined;
    let reference = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      reference = generateReference('PAY', baseCount + 1 + attempt);
      try {
        payment = await tx.payment.create({ data: { reference, ...baseData } });
        break;
      } catch (err: unknown) {
        if ((err as { code?: string })?.code !== 'P2002') throw err;
        baseCount = await this.countTodayPayments(tx, invoice.agencyId);
      }
    }
    if (!payment) {
      reference = `${generateReference('PAY', baseCount + 1)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      payment = await tx.payment.create({ data: { reference, ...baseData } });
    }

    // Mise a jour facture
    const newPaidAmount = Number(invoice.paidAmount) + applied;
    const newBalance = Number(invoice.netAmount) - newPaidAmount;
    const newStatus = newBalance <= 0 ? 'PAID' : 'PARTIAL';
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidAmount: newPaidAmount, balance: Math.max(0, newBalance), status: newStatus },
    });

    return {
      paymentId: payment.id,
      reference,
      applied,
      newStatus,
      newBalance: Math.max(0, newBalance),
      invoiceId: invoice.id,
      invoiceRef: invoice.reference,
      agencyId: invoice.agencyId,
      clientId: invoice.clientId,
      netAmount: Number(invoice.netAmount),
      currency: (invoice as { currency?: string }).currency ?? 'XAF',
    };
  }

  /**
   * EFFETS POST-COMMIT (hors transaction critique) : gel des frais de
   * magasinage DEPARTURE, attribution fidelite + totalSpent, et emission des
   * evenements metier (mails/SMS "Paiement recu" / "Facture reglee").
   */
  private async runPostSettlementEffects(
    eff: SettlementEffect,
    method: string,
    organizationId: string,
  ): Promise<void> {
    const { paymentId, reference, applied, newStatus, newBalance } = eff;

    // Gel des frais de magasinage DEPARTURE (le paiement arrete l'accumulation
    // au depart, comme pour l'encaissement agent).
    const invoiceParcels = await prisma.parcel.findMany({
      where: { invoiceId: eff.invoiceId, isDeleted: false },
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
    if (eff.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: eff.clientId },
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
              where: { id: eff.clientId },
              data: {
                loyaltyPoints: newPoints,
                loyaltyTier: newTier,
                totalSpent: { increment: applied },
              },
            }),
            prisma.loyaltyTransaction.create({
              data: {
                clientId: eff.clientId,
                points: earned,
                type: 'EARN',
                source: `payment:${paymentId}`,
                description: `Paiement en ligne ${reference} - +${earned} pts`,
              },
            }),
          ]);
        } else {
          await prisma.client.update({
            where: { id: eff.clientId },
            data: { totalSpent: { increment: applied } },
          });
        }
      }
    }

    // Evenements (mails/SMS "Paiement recu" + "Facture reglee").
    const agency = await prisma.agency.findUnique({
      where: { id: eff.agencyId },
      select: { name: true },
    });
    eventBus.emit({
      type: DomainEvents.PAYMENT_RECEIVED,
      payload: {
        paymentId,
        invoiceId: eff.invoiceId,
        agencyId: eff.agencyId,
        amount: applied,
        newInvoiceStatus: newStatus,
        clientId: eff.clientId,
        organizationId,
        invoiceRef: eff.invoiceRef,
        paymentMethod: method,
        remainingBalance: newBalance,
        agencyName: agency?.name ?? '',
      },
      timestamp: new Date(),
      userId: undefined,
    });
    if (newStatus === 'PAID') {
      eventBus.emit({
        type: DomainEvents.INVOICE_PAID,
        payload: {
          invoiceId: eff.invoiceId,
          reference: eff.invoiceRef,
          clientId: eff.clientId,
          agencyId: eff.agencyId,
          organizationId,
          totalAmount: eff.netAmount,
          currency: eff.currency,
        },
        timestamp: new Date(),
        userId: undefined,
      });
    }
  }

  /**
   * Verifie qu'un montant rapporte par le provider couvre bien le montant
   * attendu de l'intent. Tolerant a l'echelle d'unite : certains providers
   * (ex. Stripe) rapportent en unite mineure (centimes) -> reported peut valoir
   * ~100x intent.amount. On accepte donc quand reported >= attendu OU quand
   * reported correspond a l'attendu exprime en centimes. On ne rejette que les
   * vrais sous-paiements dans la meme unite.
   */
  private reportedCoversIntent(reported: number, expected: number): boolean {
    if (expected <= 0) return true;
    const epsilon = 0.01;
    if (reported + epsilon >= expected) return true; // couvre en unite majeure
    if (reported + epsilon >= expected * 100) return true; // couvre en centimes
    return false;
  }

  /** Compte les paiements du jour pour une agence (base de la reference PAY). */
  private async countTodayPayments(tx: Tx, agencyId: string): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return tx.payment.count({
      where: { agencyId, createdAt: { gte: start, lt: end } },
    });
  }
}

/**
 * Descripteur des effets post-commit d'un Payment cree dans la section
 * critique. Permet de rejouer gel magasinage / fidelite / evenements APRES le
 * commit de la transaction, sans re-lire la facture.
 */
interface SettlementEffect {
  paymentId: string;
  reference: string;
  applied: number;
  newStatus: 'PAID' | 'PARTIAL';
  newBalance: number;
  invoiceId: string;
  invoiceRef: string;
  agencyId: string;
  clientId: string | null;
  netAmount: number;
  currency: string;
}

/**
 * Sentinelle interne : levee dans la transaction quand aucun Payment n'a pu
 * etre applique (factures deja soldees / annulees) pour forcer un rollback
 * propre sans rien ecrire. Interceptee juste apres le $transaction.
 */
class NoSettlementApplied extends Error {}
