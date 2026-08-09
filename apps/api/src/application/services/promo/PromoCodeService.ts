/**
 * Application des codes promo sur une facture.
 *
 * Cycle de vie d'une utilisation (PromoCodeRedemption) :
 *   RESERVED -> le code est pose sur la facture, la remise est deduite du solde
 *               et le quota est immediatement decompte (sinon deux clients
 *               pourraient reserver le dernier usage en meme temps).
 *   CONSUMED -> la facture est soldee : l'usage devient definitif.
 *   RELEASED -> le code est retire avant reglement : quota rendu, facture
 *               remise a son montant d'origine.
 *
 * Les compteurs (`PromoCode.usedCount`, `PromoCodeAssignment.usedCount`)
 * refletent RESERVED + CONSUMED. Ils sont mis a jour dans la meme transaction
 * que la redemption, jamais recalcules a la volee.
 */
import { injectable } from 'tsyringe';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';
import { invoiceAmountsUpdate } from '../invoiceTotals';
import {
  evaluatePromoCode,
  normalizePromoCode,
  type PromoEvaluation,
  type PromoParcelView,
  type PromoUsageView,
} from './promoCodeRules';

const PROMO_INCLUDE = {
  routes: { select: { transitRouteId: true } },
} satisfies Prisma.PromoCodeInclude;

type PromoRow = Prisma.PromoCodeGetPayload<{ include: typeof PROMO_INCLUDE }>;

export interface PromoPreview {
  code: string;
  label: string;
  description: string | null;
  discountType: 'PERCENT' | 'AMOUNT';
  discountValue: number;
  evaluation: PromoEvaluation;
}

/**
 * Code propose au guichet pour une facture donnee : identite du code, origine
 * (attribue nominativement ou public) et verdict d'eligibilite deja calcule.
 */
export interface PromoCandidate {
  id: string;
  code: string;
  label: string;
  description: string | null;
  discountType: 'PERCENT' | 'AMOUNT';
  discountValue: number;
  visibility: string;
  startsAt: Date | null;
  expiresAt: Date | null;
  source: 'ASSIGNED' | 'PUBLIC';
  /** Usages restants pour ce client (null = illimite). */
  remainingUses: number | null;
  evaluation: PromoEvaluation;
}

/** Etat des codes promo d'une facture : celui pose, et ceux proposables. */
export interface InvoicePromoCandidates {
  applied: { code: string | null; label: string | null; discountAmount: number } | null;
  candidates: PromoCandidate[];
}

export interface ApplyPromoInput {
  code: string;
  invoiceId: string;
  clientId: string;
  /** null = applique par le client depuis le portail. */
  appliedByUserId?: string | null;
}

@injectable()
export class PromoCodeService {
  private db(tx?: Prisma.TransactionClient) {
    return tx ?? prisma;
  }

  // --- Lecture -------------------------------------------------------------

  /**
   * Resout un code saisi. `organizationId` cadre la recherche au tenant meme si
   * l'API est mono-organisation, pour rester correct si cela change.
   */
  private async findByCode(code: string, organizationId: string): Promise<PromoRow | null> {
    return prisma.promoCode.findFirst({
      where: { organizationId, code: normalizePromoCode(code), isDeleted: false },
      include: PROMO_INCLUDE,
    });
  }

  /**
   * Colis servant d'assiette. Pour une facture agregat de groupe, les colis
   * sont rattaches aux factures membres, pas a l'agregat : on remonte donc par
   * le groupe.
   */
  private async loadParcels(invoiceId: string, parcelGroupId: string | null) {
    const where: Prisma.ParcelWhereInput = parcelGroupId
      ? { parcelGroupId }
      : { invoiceId };
    const parcels = await prisma.parcel.findMany({
      where: { ...where, isDeleted: false },
      select: {
        price: true,
        category: true,
        transitRouteId: true,
        transitRoute: { select: { type: true } },
      },
    });
    return parcels.map<PromoParcelView>((p) => ({
      price: Number(p.price),
      category: p.category,
      transitRouteId: p.transitRouteId,
      transitType: p.transitRoute?.type ?? null,
    }));
  }

  private async loadUsage(promoCodeId: string, clientId: string): Promise<PromoUsageView> {
    const [assignment, clientUsedCount] = await Promise.all([
      prisma.promoCodeAssignment.findUnique({
        where: { promoCodeId_clientId: { promoCodeId, clientId } },
        select: { id: true, maxUses: true, usedCount: true },
      }),
      prisma.promoCodeRedemption.count({
        where: { promoCodeId, clientId, status: { in: ['RESERVED', 'CONSUMED'] } },
      }),
    ]);
    return { assignment, clientUsedCount };
  }

  private toRules(promo: PromoRow) {
    return {
      discountType: promo.discountType,
      discountValue: Number(promo.discountValue),
      maxDiscountAmount: promo.maxDiscountAmount == null ? null : Number(promo.maxDiscountAmount),
      minOrderAmount: promo.minOrderAmount == null ? null : Number(promo.minOrderAmount),
      maxOrderAmount: promo.maxOrderAmount == null ? null : Number(promo.maxOrderAmount),
      parcelCategories: promo.parcelCategories,
      transitTypes: promo.transitTypes,
      transitRouteIds: promo.routes.map((r) => r.transitRouteId),
      startsAt: promo.startsAt,
      expiresAt: promo.expiresAt,
      maxUses: promo.maxUses,
      maxUsesPerClient: promo.maxUsesPerClient,
      usedCount: promo.usedCount,
      visibility: promo.visibility,
      isActive: promo.isActive,
      isDeleted: promo.isDeleted,
    };
  }

  /**
   * Simule l'application d'un code sans rien ecrire. Utilise par le champ
   * "code promo" du tunnel de paiement pour afficher la remise avant validation.
   */
  async preview(input: {
    code: string;
    invoiceId: string;
    clientId: string;
  }): Promise<PromoPreview> {
    const invoice = await prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        id: true, clientId: true, totalAmount: true, balance: true, status: true,
        parcelGroupId: true, promoCodeId: true,
        client: { select: { organizationId: true } },
      },
    });
    if (!invoice) throw new NotFoundError('Facture', input.invoiceId);
    if (invoice.clientId !== input.clientId) throw new NotFoundError('Facture', input.invoiceId);

    const promo = await this.findByCode(input.code, invoice.client.organizationId);
    if (!promo) {
      return {
        code: normalizePromoCode(input.code),
        label: '',
        description: null,
        discountType: 'AMOUNT',
        discountValue: 0,
        evaluation: {
          ok: false,
          reason: 'NOT_FOUND',
          message: 'Code promo inconnu.',
        },
      };
    }

    const [parcels, usage, activeRedemption] = await Promise.all([
      this.loadParcels(invoice.id, invoice.parcelGroupId),
      this.loadUsage(promo.id, input.clientId),
      prisma.promoCodeRedemption.findFirst({
        where: { invoiceId: invoice.id, status: { in: ['RESERVED', 'CONSUMED'] } },
        select: { id: true },
      }),
    ]);

    const evaluation = evaluatePromoCode({
      promo: this.toRules(promo),
      invoice: {
        totalAmount: Number(invoice.totalAmount),
        balance: Number(invoice.balance),
        status: invoice.status,
      },
      parcels,
      usage,
      hasActiveRedemption: !!activeRedemption,
      now: new Date(),
    });

    return {
      code: promo.code,
      label: promo.label,
      description: promo.description,
      discountType: promo.discountType,
      discountValue: Number(promo.discountValue),
      evaluation,
    };
  }

  /**
   * Codes promo proposables sur une facture : les attributions nominatives du
   * client plus les codes publics en cours de validite, chacun accompagne de
   * son verdict d'eligibilite (et du montant de remise s'il est applicable).
   *
   * Sert au guichet : l'agent qui encaisse voit d'un coup d'oeil ce que le
   * client peut utiliser sur ces colis, sans avoir a connaitre les codes.
   *
   * Les codes hors perimetre (mauvaise categorie de colis, montant hors
   * bornes, quota epuise...) sont renvoyes eux aussi, avec le motif du refus :
   * l'agent peut ainsi expliquer au client pourquoi son code ne passe pas.
   *
   * L'assiette et les quotas sont evalues en une passe : une requete pour les
   * colis, une pour les attributions, une pour les compteurs d'usage -- pas de
   * N+1 sur le nombre de codes.
   */
  async listForInvoice(input: {
    invoiceId: string;
    /** Si fourni, verifie que la facture appartient bien a ce client. */
    clientId?: string;
  }): Promise<InvoicePromoCandidates> {
    const invoice = await prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        id: true, clientId: true, totalAmount: true, balance: true, status: true,
        parcelGroupId: true, promoDiscount: true, promoCodeLabel: true,
        promoCode: { select: { code: true } },
        client: { select: { organizationId: true } },
      },
    });
    if (!invoice) throw new NotFoundError('Facture', input.invoiceId);
    if (input.clientId && invoice.clientId !== input.clientId) {
      throw new NotFoundError('Facture', input.invoiceId);
    }

    const now = new Date();
    // Fenetre de validite : inutile de proposer un code pas encore ouvert ou
    // deja expire, il ne serait de toute facon jamais applicable.
    const validWindow: Prisma.PromoCodeWhereInput = {
      isActive: true,
      isDeleted: false,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
      ],
    };

    const [parcels, assignments, publicCodes, activeRedemption] = await Promise.all([
      this.loadParcels(invoice.id, invoice.parcelGroupId),
      prisma.promoCodeAssignment.findMany({
        where: {
          clientId: invoice.clientId,
          promoCode: { organizationId: invoice.client.organizationId, ...validWindow },
        },
        select: {
          id: true, maxUses: true, usedCount: true, promoCodeId: true,
          promoCode: { include: PROMO_INCLUDE },
        },
      }),
      prisma.promoCode.findMany({
        where: {
          organizationId: invoice.client.organizationId,
          visibility: 'PUBLIC',
          ...validWindow,
        },
        include: PROMO_INCLUDE,
      }),
      prisma.promoCodeRedemption.findFirst({
        where: { invoiceId: invoice.id, status: { in: ['RESERVED', 'CONSUMED'] } },
        select: { id: true },
      }),
    ]);

    const assignmentByPromo = new Map(assignments.map((a) => [a.promoCodeId, a]));
    // Un code public deja attribue nominativement ne doit pas apparaitre deux
    // fois : l'attribution (qui porte le quota dedie) l'emporte.
    const rows: { promo: PromoRow; source: 'ASSIGNED' | 'PUBLIC' }[] = [
      ...assignments.map((a) => ({ promo: a.promoCode, source: 'ASSIGNED' as const })),
      ...publicCodes
        .filter((p) => !assignmentByPromo.has(p.id))
        .map((p) => ({ promo: p, source: 'PUBLIC' as const })),
    ];

    // Compteurs d'usage du client, tous codes confondus, en une requete.
    const usageCounts = rows.length
      ? await prisma.promoCodeRedemption.groupBy({
          by: ['promoCodeId'],
          where: {
            clientId: invoice.clientId,
            promoCodeId: { in: rows.map((r) => r.promo.id) },
            status: { in: ['RESERVED', 'CONSUMED'] },
          },
          _count: { _all: true },
        })
      : [];
    const usedByPromo = new Map(usageCounts.map((u) => [u.promoCodeId, u._count._all]));

    const invoiceView = {
      totalAmount: Number(invoice.totalAmount),
      balance: Number(invoice.balance),
      status: invoice.status,
    };

    const candidates = rows.map<PromoCandidate>(({ promo, source }) => {
      const assignment = assignmentByPromo.get(promo.id) ?? null;
      const evaluation = evaluatePromoCode({
        promo: this.toRules(promo),
        invoice: invoiceView,
        parcels,
        usage: {
          assignment: assignment
            ? { id: assignment.id, maxUses: assignment.maxUses, usedCount: assignment.usedCount }
            : null,
          clientUsedCount: usedByPromo.get(promo.id) ?? 0,
        },
        hasActiveRedemption: !!activeRedemption,
        now,
      });

      const quota = assignment?.maxUses ?? promo.maxUsesPerClient;
      return {
        id: promo.id,
        code: promo.code,
        label: promo.label,
        description: promo.description,
        discountType: promo.discountType,
        discountValue: Number(promo.discountValue),
        visibility: promo.visibility,
        startsAt: promo.startsAt,
        expiresAt: promo.expiresAt,
        source,
        remainingUses:
          quota == null ? null : Math.max(0, quota - (usedByPromo.get(promo.id) ?? 0)),
        evaluation,
      };
    });

    // Les codes applicables d'abord, remise decroissante : l'agent propose
    // spontanement la meilleure offre. Les refus suivent, par code.
    candidates.sort((a, b) => {
      if (a.evaluation.ok !== b.evaluation.ok) return a.evaluation.ok ? -1 : 1;
      if (a.evaluation.ok && b.evaluation.ok) {
        return b.evaluation.discountAmount - a.evaluation.discountAmount;
      }
      return a.code.localeCompare(b.code);
    });

    const appliedAmount = Number(invoice.promoDiscount ?? 0);
    return {
      applied:
        appliedAmount > 0
          ? {
              code: invoice.promoCode?.code ?? null,
              label: invoice.promoCodeLabel,
              discountAmount: appliedAmount,
            }
          : null,
      candidates,
    };
  }

  // --- Ecriture ------------------------------------------------------------

  /**
   * Pose le code sur la facture : cree la redemption RESERVED, decompte les
   * quotas et recalcule les montants. Leve une BusinessError si le code n'est
   * pas eligible (le message est directement affichable au client).
   */
  async apply(input: ApplyPromoInput) {
    const preview = await this.preview({
      code: input.code,
      invoiceId: input.invoiceId,
      clientId: input.clientId,
    });
    if (!preview.evaluation.ok) {
      throw new BusinessError(preview.evaluation.message, 400, `PROMO_${preview.evaluation.reason}`);
    }
    const { discountAmount, eligibleBase } = preview.evaluation;

    return prisma.$transaction(async (tx) => {
      // Relecture dans la transaction : la facture a pu bouger entre la
      // simulation et l'ecriture (paiement concurrent, magasinage cristallise).
      const invoice = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        select: {
          id: true, agencyId: true, totalAmount: true, discount: true,
          promoDiscount: true, tva: true, paidAmount: true, status: true,
          client: { select: { organizationId: true } },
        },
      });
      if (!invoice) throw new NotFoundError('Facture', input.invoiceId);
      if (Number(invoice.promoDiscount) > 0) {
        throw new BusinessError('Un code promo est deja applique sur cette facture.', 409, 'PROMO_ALREADY_APPLIED');
      }

      const promo = await tx.promoCode.findFirst({
        where: {
          code: preview.code,
          organizationId: invoice.client.organizationId,
          isDeleted: false,
        },
        select: { id: true, code: true, label: true, maxUses: true, usedCount: true },
      });
      if (!promo) throw new NotFoundError('Code promo', preview.code);
      // Re-verification du quota global sous transaction (anti course).
      if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
        throw new BusinessError('Ce code promo a atteint sa limite d\'utilisation.', 409, 'PROMO_GLOBAL_LIMIT_REACHED');
      }

      const assignment = await tx.promoCodeAssignment.findUnique({
        where: { promoCodeId_clientId: { promoCodeId: promo.id, clientId: input.clientId } },
        select: { id: true },
      });

      const redemption = await tx.promoCodeRedemption.create({
        data: {
          promoCodeId: promo.id,
          clientId: input.clientId,
          invoiceId: invoice.id,
          assignmentId: assignment?.id ?? null,
          discountAmount,
          eligibleBase,
          codeSnapshot: promo.code,
          status: 'RESERVED',
          appliedByUserId: input.appliedByUserId ?? null,
        },
      });

      await tx.promoCode.update({
        where: { id: promo.id },
        data: { usedCount: { increment: 1 } },
      });
      if (assignment) {
        await tx.promoCodeAssignment.update({
          where: { id: assignment.id },
          data: { usedCount: { increment: 1 } },
        });
      }

      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          ...invoiceAmountsUpdate({
            totalAmount: Number(invoice.totalAmount),
            discount: Number(invoice.discount),
            promoDiscount: discountAmount,
            tva: Number(invoice.tva),
            paidAmount: Number(invoice.paidAmount),
            status: invoice.status,
          }),
          promoCodeId: promo.id,
          promoCodeLabel: `${promo.code} - ${promo.label}`,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.appliedByUserId ?? null,
          agencyId: invoice.agencyId,
          action: 'PROMO_CODE_APPLIED',
          entityType: 'Invoice',
          entityId: invoice.id,
          changes: {
            promoCode: promo.code,
            promoCodeId: promo.id,
            discountAmount,
            eligibleBase,
            newNetAmount: Number(updated.netAmount),
            newBalance: Number(updated.balance),
          },
        },
      });

      return { invoice: updated, redemption };
    });
  }

  /**
   * Retire le code encore RESERVED d'une facture et rend le quota. Refuse si
   * l'usage est deja CONSUMED (facture soldee) : on ne rembourse pas un code
   * apres coup, il faudrait passer par une remise commerciale.
   */
  async remove(input: { invoiceId: string; clientId?: string; userId?: string | null }) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        select: {
          id: true, clientId: true, agencyId: true, totalAmount: true,
          discount: true, promoDiscount: true, tva: true, paidAmount: true, status: true,
        },
      });
      if (!invoice) throw new NotFoundError('Facture', input.invoiceId);
      if (input.clientId && invoice.clientId !== input.clientId) {
        throw new NotFoundError('Facture', input.invoiceId);
      }

      const redemption = await tx.promoCodeRedemption.findFirst({
        where: { invoiceId: invoice.id, status: 'RESERVED' },
        orderBy: { createdAt: 'desc' },
      });
      if (!redemption) {
        throw new BusinessError('Aucun code promo a retirer sur cette facture.', 400, 'PROMO_NOT_APPLIED');
      }

      await tx.promoCodeRedemption.update({
        where: { id: redemption.id },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      await tx.promoCode.update({
        where: { id: redemption.promoCodeId },
        data: { usedCount: { decrement: 1 } },
      });
      if (redemption.assignmentId) {
        await tx.promoCodeAssignment.update({
          where: { id: redemption.assignmentId },
          data: { usedCount: { decrement: 1 } },
        });
      }

      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          ...invoiceAmountsUpdate({
            totalAmount: Number(invoice.totalAmount),
            discount: Number(invoice.discount),
            promoDiscount: 0,
            tva: Number(invoice.tva),
            paidAmount: Number(invoice.paidAmount),
            status: invoice.status,
          }),
          promoCodeId: null,
          promoCodeLabel: null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.userId ?? null,
          agencyId: invoice.agencyId,
          action: 'PROMO_CODE_REMOVED',
          entityType: 'Invoice',
          entityId: invoice.id,
          changes: {
            promoCode: redemption.codeSnapshot,
            restoredAmount: Number(redemption.discountAmount),
            newNetAmount: Number(updated.netAmount),
            newBalance: Number(updated.balance),
          },
        },
      });

      return updated;
    });
  }

  /**
   * Aligne le statut des utilisations sur l'etat de la facture. Idempotent,
   * appele apres chaque mouvement d'encaissement (caisse, paiement en ligne,
   * annulation de paiement) :
   *   facture soldee   -> RESERVED devient CONSUMED
   *   solde rouvert    -> CONSUMED redevient RESERVED (paiement annule)
   * Ne touche jamais aux compteurs : ils sont deja decomptes a la reservation
   * et ne sont rendus qu'en cas de retrait explicite du code.
   */
  async syncForInvoice(invoiceId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const db = this.db(tx);
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      select: { balance: true, status: true },
    });
    if (!invoice || invoice.status === 'CANCELLED') return;

    if (Number(invoice.balance) <= 0) {
      await db.promoCodeRedemption.updateMany({
        where: { invoiceId, status: 'RESERVED' },
        data: { status: 'CONSUMED', consumedAt: new Date() },
      });
    } else {
      await db.promoCodeRedemption.updateMany({
        where: { invoiceId, status: 'CONSUMED' },
        data: { status: 'RESERVED', consumedAt: null },
      });
    }
  }
}

export const PROMO_CODE_SERVICE = Symbol.for('PromoCodeService');
