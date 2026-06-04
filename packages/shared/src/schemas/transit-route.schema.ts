import { z } from 'zod';
import { TransitType } from '../constants/enums';
import { validatePricing } from './pricing-rules';

export const createTransitRouteSchema = z
  .object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres'),
    type: z.enum([TransitType.AIR, TransitType.SEA, TransitType.LAND]),
    departureCity: z.string().min(2, 'Ville de depart requise'),
    departureCountry: z.string().min(2, 'Pays de depart requis'),
    arrivalCity: z.string().min(2, "Ville d'arrivee requise"),
    arrivalCountry: z.string().min(2, "Pays d'arrivee requis"),
    // Prix nullable + preprocess : un champ vide / NaN -> null (au lieu de
    // crasher la validation z.number()). La regle metier active appliquee
    // dans superRefine en aval cible alors le BON champ selon le type.
    pricePerKg: z.preprocess(
      (v) => (v === '' || v === undefined || v === null || Number.isNaN(v as number) ? null : v),
      z.number().nonnegative('Le prix par kg ne peut pas etre negatif').nullable().optional(),
    ),
    pricePerVolume: z.preprocess(
      (v) => (v === '' || v === undefined || v === null || Number.isNaN(v as number) ? null : v),
      z.number().nonnegative('Le prix par m3 ne peut pas etre negatif').nullable().optional(),
    ),
    estimatedDurationDays: z.number().int().min(0).optional().default(0),
  })
  .superRefine((data, ctx) => validatePricing(data, ctx));

/**
 * Update : tous les champs optionnels MAIS si type ou un prix est fourni, on
 * doit pouvoir verifier la coherence. On utilise superRefine pour ne valider
 * que les combos pertinents.
 */
export const updateTransitRouteSchema = z
  .object({
    name: z.string().min(2).optional(),
    type: z.enum([TransitType.AIR, TransitType.SEA, TransitType.LAND]).optional(),
    departureCity: z.string().min(2).optional(),
    departureCountry: z.string().min(2).optional(),
    arrivalCity: z.string().min(2).optional(),
    arrivalCountry: z.string().min(2).optional(),
    pricePerKg: z.preprocess(
      (v) => (v === '' || v === undefined || v === null || Number.isNaN(v as number) ? null : v),
      z.number().nonnegative().nullable().optional(),
    ),
    pricePerVolume: z.preprocess(
      (v) => (v === '' || v === undefined || v === null || Number.isNaN(v as number) ? null : v),
      z.number().nonnegative().nullable().optional(),
    ),
    estimatedDurationDays: z.number().int().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type !== undefined) validatePricing(data, ctx);
  });

export type CreateTransitRouteInput = z.infer<typeof createTransitRouteSchema>;
export type UpdateTransitRouteInput = z.infer<typeof updateTransitRouteSchema>;
