import { inject, injectable } from 'tsyringe';
import type { RecordPaymentInput } from '@transitsoftservices/shared';
import { generateReference } from '@transitsoftservices/shared';
import { PAYMENT_REPOSITORY, type IPaymentRepository } from '../../interfaces/IPaymentRepository';
import { INVOICE_REPOSITORY, type IInvoiceRepository } from '../../interfaces/IInvoiceRepository';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { JOURNAL_ENTRY_REPOSITORY, type IJournalEntryRepository } from '../../interfaces/IJournalEntryRepository';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';
import { assertAgencyActive, assertAgencyInScope, type ScopeCtx } from '../../services/scope/agencyScope';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { prisma } from '../../../config/database';
import { LoyaltyConfigService } from '../../services/LoyaltyConfigService';
import { GroupInvoiceService } from '../../services/GroupInvoiceService';
import { StorageChargeService } from '../../services/StorageChargeService';
import { AccountingAccountService } from '../../services/AccountingAccountService';

function tierFor(
  points: number,
  thresholds: { SILVER: number; GOLD: number; VIP: number },
): 'STANDARD' | 'SILVER' | 'GOLD' | 'VIP' {
  if (points >= thresholds.VIP) return 'VIP';
  if (points >= thresholds.GOLD) return 'GOLD';
  if (points >= thresholds.SILVER) return 'SILVER';
  return 'STANDARD';
}

@injectable()
export class RecordPaymentUseCase {
  constructor(
    @inject(PAYMENT_REPOSITORY) private paymentRepo: IPaymentRepository,
    @inject(INVOICE_REPOSITORY) private invoiceRepo: IInvoiceRepository,
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
    @inject(JOURNAL_ENTRY_REPOSITORY) private journalRepo: IJournalEntryRepository,
    private loyaltyConfig: LoyaltyConfigService,
    private groupInvoice: GroupInvoiceService,
    private storageCharges: StorageChargeService,
    private accountingAccounts: AccountingAccountService,
  ) {}

  async execute(input: RecordPaymentInput, userId: string, ctx?: ScopeCtx): Promise<any> {
    // 1. Validate invoice
    let invoice = await this.invoiceRepo.findById(input.invoiceId);
    if (!invoice) throw new NotFoundError('Facture', input.invoiceId);

    // SECURITE (integrite financiere) : l'agence d'imputation du paiement est
    // celle de la FACTURE, jamais celle fournie par le client. Un body.agencyId
    // arbitraire permettrait sinon d'attribuer un encaissement (crediter la
    // caisse, poster au journal) a n'importe quelle agence. On derive donc
    // agencyId cote serveur depuis invoice.agencyId et on l'utilise pour le
    // Payment, la caisse, le journal et les evenements.
    const agencyId = invoice.agencyId;

    // SECURITE (scope agence) : un personnel ne peut encaisser que pour une de
    // SES agences. Garde dure (independante du mode shadow), admin bypass.
    if (ctx) assertAgencyInScope(agencyId, ctx);

    // Agence desactivee : aucun encaissement (caisse, journal) possible.
    await assertAgencyActive(agencyId);

    // Frais de magasinage : cristallisation AVANT tout controle de solde, pour
    // qu'ils fassent partie du montant a payer. Consequence voulue : une facture
    // deja soldee dont le colis n'a pas ete retire repasse en PARTIAL et
    // redevient payable a hauteur des frais accumules.
    const storageGroupId = (invoice as { parcelGroupId?: string | null }).parcelGroupId;
    if (storageGroupId) {
      // Facture agregat : elle n'a pas de colis lies, le magasinage vit sur les
      // factures membres. On cristallise chaque membre puis on resynchronise.
      const memberParcels = await prisma.parcel.findMany({
        where: { parcelGroupId: storageGroupId, isDeleted: false },
        select: { invoiceId: true },
      });
      const memberInvoiceIds = [
        ...new Set(memberParcels.map((p) => p.invoiceId).filter((v): v is string => !!v)),
      ];
      let billed = 0;
      for (const memberId of memberInvoiceIds) {
        billed += await this.storageCharges.crystallizeForInvoice({
          invoiceId: memberId,
          reason: 'PAYMENT',
        });
      }
      if (billed > 0) await this.groupInvoice.sync(storageGroupId);
    } else {
      await this.storageCharges.crystallizeForInvoice({
        invoiceId: invoice.id,
        reason: 'PAYMENT',
      });
    }
    invoice = (await this.invoiceRepo.findById(input.invoiceId)) ?? invoice;

    if (invoice.status === 'PAID') {
      throw new BusinessError('Cette facture est deja soldee');
    }

    // Garantit le plan comptable du tenant AVANT toute mutation. Le posting au
    // journal (etape 7) connecte des AccountingAccount par code ; si le tenant
    // n'a pas de plan comptable, le create throw APRES que le paiement, la
    // facture et la caisse ont deja ete committes (pas de transaction
    // englobante) -> paiement partiel + 404. Idempotent (no-op si deja present).
    const orgId = await this.resolveOrganizationId(agencyId);
    if (orgId) await this.accountingAccounts.ensureCoreAccounts(orgId);

    // Paiement d'une facture AGREGAT de groupe : on ne paye pas la facture
    // agregat directement (elle n'a pas de colis lies). On distribue le
    // montant sur les factures membres non soldees, proportionnellement a
    // leur solde, puis on resynchronise l'agregat.
    if ((invoice as { parcelGroupId?: string | null }).parcelGroupId) {
      const groupId = (invoice as { parcelGroupId: string }).parcelGroupId;
      const splits = await this.groupInvoice.splitAmountAcrossMembers(groupId, input.amount);
      if (splits.length === 0) {
        throw new BusinessError('Aucune facture de colis a payer dans ce groupe.');
      }
      const subPayments = [];
      for (const s of splits) {
        const r = await this.execute(
          { ...input, invoiceId: s.invoiceId, amount: s.amount },
          userId,
          ctx,
        );
        subPayments.push(r);
      }
      await this.groupInvoice.sync(groupId);
      const refreshed = await this.invoiceRepo.findById(invoice.id);
      return {
        groupPayment: true,
        distributed: splits,
        invoiceStatus: refreshed?.status,
        invoiceBalance: refreshed ? Number(refreshed.balance) : 0,
        subPayments,
      };
    }

    if (invoice.status === 'CANCELLED') {
      throw new BusinessError('Cette facture est annulee');
    }

    // Refus paiement si TOUS les colis lies a la facture sont LOST :
    // facturer un colis perdu n'a pas de sens (annulation / remboursement
    // attendu plutot). Si un seul colis sur N est LOST, on autorise (les
    // autres restent dus).
    const invoiceParcelsForLostCheck = await prisma.parcel.findMany({
      where: { invoiceId: invoice.id, isDeleted: false },
      select: { status: true },
    });
    if (invoiceParcelsForLostCheck.length > 0 && invoiceParcelsForLostCheck.every((p) => p.status === 'LOST')) {
      throw new BusinessError(
        'Tous les colis de cette facture sont marques comme perdus. Aucun paiement ne peut etre enregistre.',
      );
    }

    // 2. Validate amount
    const balance = Number(invoice.balance);
    if (input.amount > balance) {
      throw new BusinessError(
        `Le montant (${input.amount}) depasse le solde restant (${balance})`,
      );
    }

    // 3. Generate reference + create payment (race-safe : retry sur P2002).
    // countByAgencyAndDate n'est pas atomique : deux requetes concurrentes
    // peuvent produire la meme reference. On retente jusqu'a 5x en incrementant
    // le compteur, puis on bascule sur un suffix aleatoire en dernier recours.
    const baseData = {
      amount: input.amount,
      discount: input.discount ?? 0,
      discountReason: input.discountReason ?? null,
      tva: input.tva ?? 0,
      paymentMethod: input.paymentMethod,
      transactionReference: input.transactionReference ?? null,
      invoice: { connect: { id: input.invoiceId } },
      agency: { connect: { id: agencyId } },
      receivedBy: { connect: { id: userId } },
      ...(input.parcelId && { parcel: { connect: { id: input.parcelId } } }),
      ...(input.attachments && input.attachments.length > 0 && {
        attachments: {
          create: input.attachments.map((a) => ({
            url: a.url,
            key: a.key,
            kind: a.kind,
            caption: a.caption ?? null,
            uploadedBy: { connect: { id: userId } },
          })),
        },
      }),
    };

    // Sequence basee sur le MAX reel des references du jour (toutes agences) :
    // la reference PAY-YYYYMMDD-NNNN est globale, donc un compteur par-agence
    // collisionnait systematiquement entre agences le meme jour.
    let baseCount = await this.paymentRepo.maxDailySequence('PAY', new Date());
    let payment: Awaited<ReturnType<typeof this.paymentRepo.create>> | undefined;
    let reference = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      reference = generateReference('PAY', baseCount + 1 + attempt);
      try {
        payment = await this.paymentRepo.create({ reference, ...baseData });
        break;
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code !== 'P2002') throw err;
        baseCount = await this.paymentRepo.maxDailySequence('PAY', new Date());
      }
    }
    if (!payment) {
      reference = `${generateReference('PAY', baseCount + 1)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      payment = await this.paymentRepo.create({ reference, ...baseData });
    }

    // 5. Update invoice
    const newPaidAmount = Number(invoice.paidAmount) + input.amount;
    const newBalance = Number(invoice.netAmount) - newPaidAmount;
    const newStatus = newBalance <= 0 ? 'PAID' : 'PARTIAL';

    await this.invoiceRepo.update(invoice.id, {
      paidAmount: newPaidAmount,
      balance: Math.max(0, newBalance),
      status: newStatus,
    });

    // NB : les frais de magasinage ont deja ete cristallises (et factures) en
    // debut d'execute. Les charges DEPARTURE sont donc stoppees, et les charges
    // DESTINATION ont ete rouvertes sur un nouveau segment : les frais
    // continuent de courir tant que le colis n'est pas retire.

    // Si cette facture est celle d'un colis appartenant a un groupe, on
    // resynchronise la facture agregat du groupe (montants + statut).
    const groupId = await this.groupInvoice.resolveGroupId(invoice.id);
    if (groupId) {
      await this.groupInvoice.sync(groupId);
    }

    // 6. Update cash register (auto)
    const cashRegister = await this.cashRegisterRepo.findOrCreateForToday(agencyId);
    await this.cashRegisterRepo.addEntry(cashRegister.id, input.amount);

    // 7. Create journal entry (double-entry bookkeeping). Reference race-safe :
    // countByDate non atomique -> retry sur P2002, suffix random en dernier
    // recours (meme pattern que la reference de paiement).
    const journalLines = {
      create: [
        {
          debitAccount: { connect: { code: '101000' } },  // Caisse
          debitAmount: input.amount,
          creditAmount: 0,
          description: `Encaissement ${reference}`,
        },
        {
          creditAccount: { connect: { code: '301000' } }, // Creances clients
          debitAmount: 0,
          creditAmount: input.amount,
          description: `Reglement facture ${invoice.reference}`,
        },
      ],
    };
    let journalBase = await this.journalRepo.maxDailySequence('JRN', new Date());
    let journalCreated = false;
    for (let attempt = 0; attempt < 5 && !journalCreated; attempt++) {
      try {
        await this.journalRepo.create({
          reference: generateReference('JRN', journalBase + 1 + attempt),
          description: `Paiement ${reference} - Facture ${invoice.reference}`,
          sourceType: 'PAYMENT',
          sourceId: payment.id,
          agency: { connect: { id: agencyId } },
          createdBy: { connect: { id: userId } },
          lines: journalLines,
        });
        journalCreated = true;
      } catch (err: unknown) {
        if ((err as { code?: string })?.code !== 'P2002') throw err;
        journalBase = await this.journalRepo.maxDailySequence('JRN', new Date());
      }
    }
    if (!journalCreated) {
      await this.journalRepo.create({
        reference: `${generateReference('JRN', journalBase + 1)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        description: `Paiement ${reference} - Facture ${invoice.reference}`,
        sourceType: 'PAYMENT',
        sourceId: payment.id,
        agency: { connect: { id: agencyId } },
        createdBy: { connect: { id: userId } },
        lines: journalLines,
      });
    }

    // 8. Attribution loyalty points (audit fix #12) -- conditionnelle :
    // si la politique de fidelite est desactivee par l'admin, on n'accumule
    // PAS de points (le client garde son solde existant mais ne gagne pas
    // a chaque paiement). totalSpent reste neanmoins mis a jour car
    // c'est une stat commerciale orthogonale a la fidelite.
    if (invoice.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: invoice.clientId },
        select: { loyaltyPoints: true, loyaltyTier: true, totalSpent: true, organizationId: true },
      });
      if (client) {
        const loyaltyCfg = await this.loyaltyConfig.get(client.organizationId);
        const earnedPoints = loyaltyCfg.enabled
          ? Math.floor(input.amount * loyaltyCfg.pointsPerXaf)
          : 0;
        if (loyaltyCfg.enabled && earnedPoints > 0) {
          const newPoints = client.loyaltyPoints + earnedPoints;
          const newTier = tierFor(newPoints, loyaltyCfg.tierThresholds);
          const tierUpgraded = newTier !== client.loyaltyTier;
          await prisma.$transaction([
            prisma.client.update({
              where: { id: invoice.clientId },
              data: {
                loyaltyPoints: newPoints,
                loyaltyTier: newTier,
                totalSpent: { increment: input.amount },
              },
            }),
            prisma.loyaltyTransaction.create({
              data: {
                clientId: invoice.clientId,
                points: earnedPoints,
                type: 'EARN',
                source: `payment:${payment.id}`,
                description: `Paiement ${reference} - +${earnedPoints} pts${tierUpgraded ? ` (passage ${newTier})` : ''}`,
              },
            }),
          ]);
        } else {
          // Fidelite inactive : on met juste a jour totalSpent.
          await prisma.client.update({
            where: { id: invoice.clientId },
            data: { totalSpent: { increment: input.amount } },
          });
        }
      }
    }

    // 9. Emit event. Payload enrichi pour les templates email/SMS :
    // sans invoiceRef/paymentMethod/remainingBalance/agencyName le mail
    // "Paiement recu" affichait des cellules vides.
    const agencyName = await this.resolveAgencyName(agencyId);
    eventBus.emit({
      type: DomainEvents.PAYMENT_RECEIVED,
      payload: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        agencyId,
        amount: input.amount,
        newInvoiceStatus: newStatus,
        clientId: invoice.clientId,
        organizationId: (invoice as any).organizationId ?? null,
        invoiceRef: invoice.reference,
        paymentMethod: input.paymentMethod,
        remainingBalance: Math.max(0, newBalance),
        agencyName,
      },
      timestamp: new Date(),
      userId,
    });

    // Emit invoice.paid quand le solde tombe a 0 -- handler dedie envoie
    // "Facture reglee" au client.
    if (newStatus === 'PAID') {
      eventBus.emit({
        type: DomainEvents.INVOICE_PAID,
        payload: {
          invoiceId: invoice.id,
          reference: invoice.reference,
          clientId: invoice.clientId,
          agencyId,
          organizationId: (invoice as any).organizationId ?? null,
          totalAmount: invoice.netAmount,
          currency: (invoice as any).currency ?? 'XAF',
        },
        timestamp: new Date(),
        userId,
      });
    }

    return {
      payment,
      invoiceStatus: newStatus,
      invoiceBalance: Math.max(0, newBalance),
    };
  }

  /** Resolution de l'organisation d'une agence (cache memoire en process). */
  private agencyOrgCache = new Map<string, string | null>();
  private async resolveOrganizationId(agencyId: string): Promise<string | null> {
    if (this.agencyOrgCache.has(agencyId)) return this.agencyOrgCache.get(agencyId)!;
    const a = await prisma.agency.findUnique({
      where: { id: agencyId },
      select: { organizationId: true },
    });
    const orgId = a?.organizationId ?? null;
    this.agencyOrgCache.set(agencyId, orgId);
    return orgId;
  }

  /** Resolution simple du nom d'agence (cache memoire en process). */
  private agencyNameCache = new Map<string, string>();
  private async resolveAgencyName(agencyId: string): Promise<string> {
    const cached = this.agencyNameCache.get(agencyId);
    if (cached) return cached;
    const a = await prisma.agency.findUnique({
      where: { id: agencyId },
      select: { name: true },
    });
    const name = a?.name ?? '';
    if (name) this.agencyNameCache.set(agencyId, name);
    return name;
  }
}
