import { z } from 'zod';
import { TransitType } from '../constants/enums';
import { ParcelCategoryValues } from './parcel.schema';

export const PromoDiscountTypeValues = ['PERCENT', 'AMOUNT'] as const;
export type PromoDiscountType = (typeof PromoDiscountTypeValues)[number];

export const PromoCodeVisibilityValues = ['PUBLIC', 'PRIVATE', 'ASSIGNED'] as const;
export type PromoCodeVisibility = (typeof PromoCodeVisibilityValues)[number];

export const PromoRedemptionStatusValues = ['RESERVED', 'CONSUMED', 'RELEASED'] as const;
export type PromoRedemptionStatus = (typeof PromoRedemptionStatusValues)[number];

const transitTypeValues = [TransitType.AIR, TransitType.SEA, TransitType.LAND] as const;

/** Champ numerique optionnel : chaine vide / NaN -> null (saisie formulaire). */
const optionalAmount = (message: string) =>
  z.preprocess(
    (v) => (v === '' || v === undefined || v === null || Number.isNaN(v as number) ? null : v),
    z.number().nonnegative(message).nullable().optional(),
  );

const optionalCount = (message: string) =>
  z.preprocess(
    (v) => (v === '' || v === undefined || v === null || Number.isNaN(v as number) ? null : v),
    z.number().int().positive(message).nullable().optional(),
  );

const optionalDate = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? null : v),
  z.coerce.date().nullable().optional(),
);

const promoCodeBase = {
  code: z
    .string()
    .min(3, 'Le code doit contenir au moins 3 caracteres')
    .max(32, 'Le code ne peut pas depasser 32 caracteres')
    .regex(/^[A-Za-z0-9\s-]+$/, 'Lettres, chiffres, espaces et tirets uniquement'),
  label: z.string().min(2, 'Libelle requis').max(120),
  description: z.string().max(1000).nullable().optional(),

  discountType: z.enum(PromoDiscountTypeValues),
  discountValue: z.number().positive('La valeur de la remise doit etre superieure a 0'),
  maxDiscountAmount: optionalAmount('Le plafond ne peut pas etre negatif'),

  minOrderAmount: optionalAmount('Le montant minimum ne peut pas etre negatif'),
  maxOrderAmount: optionalAmount('Le montant maximum ne peut pas etre negatif'),

  parcelCategories: z.array(z.enum(ParcelCategoryValues)).optional().default([]),
  transitTypes: z.array(z.enum(transitTypeValues)).optional().default([]),
  transitRouteIds: z.array(z.string().uuid()).optional().default([]),

  startsAt: optionalDate,
  expiresAt: optionalDate,

  maxUses: optionalCount("La limite d'utilisation doit etre un entier positif"),
  maxUsesPerClient: optionalCount('La limite par client doit etre un entier positif'),

  visibility: z.enum(PromoCodeVisibilityValues).optional().default('PUBLIC'),
};

/**
 * Regles transverses : un pourcentage reste dans 0-100, la fenetre de validite
 * et l'intervalle de tarifs doivent etre ordonnes.
 */
function refinePromoCode(
  data: {
    discountType?: PromoDiscountType;
    discountValue?: number;
    minOrderAmount?: number | null;
    maxOrderAmount?: number | null;
    startsAt?: Date | null;
    expiresAt?: Date | null;
  },
  ctx: z.RefinementCtx,
) {
  if (data.discountType === 'PERCENT' && (data.discountValue ?? 0) > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Un pourcentage de remise ne peut pas depasser 100.',
      path: ['discountValue'],
    });
  }
  if (
    data.minOrderAmount != null &&
    data.maxOrderAmount != null &&
    data.minOrderAmount > data.maxOrderAmount
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Le montant minimum doit etre inferieur au montant maximum.',
      path: ['minOrderAmount'],
    });
  }
  if (data.startsAt && data.expiresAt && data.startsAt > data.expiresAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La date de debut doit preceder la date d'expiration.",
      path: ['expiresAt'],
    });
  }
}

export const createPromoCodeSchema = z.object(promoCodeBase).superRefine(refinePromoCode);

export const updatePromoCodeSchema = z
  .object({
    ...promoCodeBase,
    code: promoCodeBase.code.optional(),
    label: promoCodeBase.label.optional(),
    discountType: z.enum(PromoDiscountTypeValues).optional(),
    discountValue: z.number().positive().optional(),
    parcelCategories: z.array(z.enum(ParcelCategoryValues)).optional(),
    transitTypes: z.array(z.enum(transitTypeValues)).optional(),
    transitRouteIds: z.array(z.string().uuid()).optional(),
    visibility: z.enum(PromoCodeVisibilityValues).optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine(refinePromoCode);

/** Attribution nominative a un ou plusieurs clients, avec quota par client. */
export const assignPromoCodeSchema = z.object({
  clientIds: z.array(z.string().uuid()).min(1, 'Selectionnez au moins un client'),
  maxUses: optionalCount('Le nombre d\'utilisations doit etre un entier positif'),
  /** true = remplace les attributions existantes non utilisees. */
  replace: z.boolean().optional().default(false),
});

/** Saisie du code par le client au moment du paiement. */
export const applyPromoCodeSchema = z.object({
  code: z.string().min(1, 'Code promo requis').max(64),
});

export type CreatePromoCodeInput = z.infer<typeof createPromoCodeSchema>;
export type UpdatePromoCodeInput = z.infer<typeof updatePromoCodeSchema>;
export type AssignPromoCodeInput = z.infer<typeof assignPromoCodeSchema>;
export type ApplyPromoCodeInput = z.infer<typeof applyPromoCodeSchema>;
