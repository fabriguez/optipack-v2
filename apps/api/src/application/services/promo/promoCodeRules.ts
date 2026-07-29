/**
 * Regles pures des codes promo : normalisation, verification d'eligibilite et
 * calcul du montant de remise. Aucun acces base ici -- tout est passe en
 * entree, ce qui rend les regles testables isolement et reutilisables par la
 * previsualisation client comme par l'application effective.
 */
import type {
  ParcelCategory,
  PromoCodeVisibility,
  PromoDiscountType,
  TransitType,
} from '@prisma/client';

/** Motifs de refus, stables : le front les mappe sur un message francais. */
export type PromoRejectionReason =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'NOT_ASSIGNED'
  | 'GLOBAL_LIMIT_REACHED'
  | 'CLIENT_LIMIT_REACHED'
  | 'NO_ELIGIBLE_PARCEL'
  | 'BELOW_MIN_AMOUNT'
  | 'ABOVE_MAX_AMOUNT'
  | 'INVOICE_NOT_PAYABLE'
  | 'ALREADY_APPLIED'
  | 'NO_DISCOUNT';

export const PROMO_REJECTION_MESSAGES: Record<PromoRejectionReason, string> = {
  NOT_FOUND: 'Code promo inconnu.',
  INACTIVE: 'Ce code promo n\'est plus actif.',
  NOT_STARTED: 'Ce code promo n\'est pas encore valable.',
  EXPIRED: 'Ce code promo a expire.',
  NOT_ASSIGNED: 'Ce code promo est reserve a certains clients.',
  GLOBAL_LIMIT_REACHED: 'Ce code promo a atteint sa limite d\'utilisation.',
  CLIENT_LIMIT_REACHED: 'Vous avez deja utilise ce code le nombre de fois autorise.',
  NO_ELIGIBLE_PARCEL: 'Aucun colis de cette facture n\'est concerne par ce code.',
  BELOW_MIN_AMOUNT: 'Le montant de la facture est inferieur au minimum requis.',
  ABOVE_MAX_AMOUNT: 'Le montant de la facture depasse le maximum autorise.',
  INVOICE_NOT_PAYABLE: 'Cette facture ne peut plus recevoir de remise.',
  ALREADY_APPLIED: 'Un code promo est deja applique sur cette facture.',
  NO_DISCOUNT: 'Ce code n\'accorde aucune remise sur cette facture.',
};

/** Vue minimale d'un code promo necessaire aux regles. */
export interface PromoCodeRules {
  discountType: PromoDiscountType;
  discountValue: number;
  maxDiscountAmount: number | null;
  minOrderAmount: number | null;
  maxOrderAmount: number | null;
  parcelCategories: ParcelCategory[];
  transitTypes: TransitType[];
  /** Ids de routes de transit autorisees. Vide = toutes. */
  transitRouteIds: string[];
  startsAt: Date | null;
  expiresAt: Date | null;
  maxUses: number | null;
  maxUsesPerClient: number | null;
  usedCount: number;
  visibility: PromoCodeVisibility;
  isActive: boolean;
  isDeleted: boolean;
}

/** Colis pris en compte pour determiner l'assiette de la remise. */
export interface PromoParcelView {
  price: number;
  category: ParcelCategory;
  transitRouteId: string | null;
  transitType: TransitType | null;
}

export interface PromoUsageView {
  /** Assignation nominative du code a ce client, si elle existe. */
  assignment: { id: string; maxUses: number | null; usedCount: number } | null;
  /** Nombre de redemptions non liberees de ce client sur ce code. */
  clientUsedCount: number;
}

export interface PromoInvoiceView {
  totalAmount: number;
  /** Reste du a l'instant T : plafond absolu de la remise. */
  balance: number;
  status: string;
}

export type PromoEvaluation =
  | { ok: false; reason: PromoRejectionReason; message: string }
  | { ok: true; discountAmount: number; eligibleBase: number };

/** Majuscules, sans espaces ni tirets : la saisie client est permissive. */
export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '');
}

function reject(reason: PromoRejectionReason): PromoEvaluation {
  return { ok: false, reason, message: PROMO_REJECTION_MESSAGES[reason] };
}

/**
 * Assiette de la remise = somme des prix des colis concernes par le perimetre
 * du code. Un perimetre vide sur les trois axes signifie "toute la facture" :
 * on retombe alors sur le brut, ce qui couvre aussi les factures sans colis
 * rattache (agregat de groupe) et le magasinage deja cristallise.
 */
export function computeEligibleBase(
  promo: Pick<PromoCodeRules, 'parcelCategories' | 'transitTypes' | 'transitRouteIds'>,
  invoice: Pick<PromoInvoiceView, 'totalAmount'>,
  parcels: PromoParcelView[],
): number {
  const hasScope =
    promo.parcelCategories.length > 0 ||
    promo.transitTypes.length > 0 ||
    promo.transitRouteIds.length > 0;

  if (!hasScope) return invoice.totalAmount;

  const eligible = parcels.filter((p) => {
    if (promo.parcelCategories.length > 0 && !promo.parcelCategories.includes(p.category)) {
      return false;
    }
    if (
      promo.transitTypes.length > 0 &&
      (p.transitType === null || !promo.transitTypes.includes(p.transitType))
    ) {
      return false;
    }
    if (
      promo.transitRouteIds.length > 0 &&
      (p.transitRouteId === null || !promo.transitRouteIds.includes(p.transitRouteId))
    ) {
      return false;
    }
    return true;
  });

  // L'assiette ne peut pas depasser le brut de la facture (garde-fou si des
  // prix de colis ont derive par rapport a la facture).
  return Math.min(
    invoice.totalAmount,
    eligible.reduce((s, p) => s + p.price, 0),
  );
}

/** Remise brute avant plafonnement par le solde de la facture. */
export function computeRawDiscount(
  promo: Pick<PromoCodeRules, 'discountType' | 'discountValue' | 'maxDiscountAmount'>,
  eligibleBase: number,
): number {
  if (eligibleBase <= 0) return 0;

  let discount =
    promo.discountType === 'PERCENT'
      ? Math.round((eligibleBase * promo.discountValue) / 100)
      : Math.round(promo.discountValue);

  if (promo.maxDiscountAmount != null) {
    discount = Math.min(discount, promo.maxDiscountAmount);
  }
  return Math.max(0, Math.min(discount, eligibleBase));
}

/** Nombre d'usages restants pour ce client, `null` = illimite. */
export function remainingUsesForClient(
  promo: Pick<PromoCodeRules, 'maxUsesPerClient'>,
  usage: PromoUsageView,
): number | null {
  // L'assignation nominative prime sur le quota generique du code.
  const limit = usage.assignment?.maxUses ?? promo.maxUsesPerClient;
  if (limit == null) return null;
  const used = usage.assignment ? usage.assignment.usedCount : usage.clientUsedCount;
  return Math.max(0, limit - used);
}

/**
 * Verdict complet. `now` est injecte pour rendre les tests deterministes.
 */
export function evaluatePromoCode(params: {
  promo: PromoCodeRules;
  invoice: PromoInvoiceView;
  parcels: PromoParcelView[];
  usage: PromoUsageView;
  hasActiveRedemption: boolean;
  now: Date;
}): PromoEvaluation {
  const { promo, invoice, parcels, usage, hasActiveRedemption, now } = params;

  if (!promo.isActive || promo.isDeleted) return reject('INACTIVE');
  if (promo.startsAt && now < promo.startsAt) return reject('NOT_STARTED');
  if (promo.expiresAt && now > promo.expiresAt) return reject('EXPIRED');

  if (promo.visibility === 'ASSIGNED' && !usage.assignment) return reject('NOT_ASSIGNED');

  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
    return reject('GLOBAL_LIMIT_REACHED');
  }
  const remaining = remainingUsesForClient(promo, usage);
  if (remaining !== null && remaining <= 0) return reject('CLIENT_LIMIT_REACHED');

  if (invoice.status === 'CANCELLED' || invoice.balance <= 0) {
    return reject('INVOICE_NOT_PAYABLE');
  }
  if (hasActiveRedemption) return reject('ALREADY_APPLIED');

  const eligibleBase = computeEligibleBase(promo, invoice, parcels);
  if (eligibleBase <= 0) return reject('NO_ELIGIBLE_PARCEL');

  if (promo.minOrderAmount != null && eligibleBase < promo.minOrderAmount) {
    return reject('BELOW_MIN_AMOUNT');
  }
  if (promo.maxOrderAmount != null && eligibleBase > promo.maxOrderAmount) {
    return reject('ABOVE_MAX_AMOUNT');
  }

  // La remise ne peut jamais faire passer la facture sous ce qui est deja
  // encaisse : on la borne au reste du.
  const discountAmount = Math.min(computeRawDiscount(promo, eligibleBase), invoice.balance);
  if (discountAmount <= 0) return reject('NO_DISCOUNT');

  return { ok: true, discountAmount, eligibleBase };
}
