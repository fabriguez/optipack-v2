import { z } from 'zod';
import { TransitType } from '../constants/enums';

/**
 * Validation prix par type de transport :
 *  - AIR  -> facturation au kg uniquement (pricePerKg > 0 obligatoire)
 *  - SEA  -> facturation au m3 uniquement (pricePerVolume > 0 obligatoire)
 *  - LAND -> les deux acceptes, au moins un des deux > 0
 *
 * La DB conserve les deux champs (pricePerKg, pricePerVolume) comme Decimal
 * non null avec default 0 : c'est le refine ci-dessous qui exige les bonnes
 * valeurs selon le type. Le champ inutilise (pricePerKg pour SEA, etc.) est
 * persiste a 0 -- cela rend impossible le calcul de prix dans le mauvais mode
 * cote backend (PricingService verifie le mode actif de la route).
 */
interface PricingShape {
  type?: 'AIR' | 'SEA' | 'LAND';
  pricePerKg?: number | null;
  pricePerVolume?: number | null;
}

function validatePricing(
  data: PricingShape,
  ctx: z.RefinementCtx,
): void {
  const kg = data.pricePerKg ?? 0;
  const vol = data.pricePerVolume ?? 0;
  if (data.type === 'AIR') {
    if (kg <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Une route aerienne exige un prix au kilogramme superieur a 0.',
        path: ['pricePerKg'],
      });
    }
  } else if (data.type === 'SEA') {
    if (vol <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Une route maritime exige un prix au metre cube superieur a 0.',
        path: ['pricePerVolume'],
      });
    }
  } else if (data.type === 'LAND') {
    if (kg <= 0 && vol <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Une route terrestre exige au moins un prix au kg ou au m3.',
        path: ['pricePerKg'],
      });
    }
  }
}

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
