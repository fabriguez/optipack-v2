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
function checkPricing(data: {
  type?: 'AIR' | 'SEA' | 'LAND';
  pricePerKg?: number;
  pricePerVolume?: number;
}): boolean {
  const kg = data.pricePerKg ?? 0;
  const vol = data.pricePerVolume ?? 0;
  if (data.type === 'AIR') return kg > 0;
  if (data.type === 'SEA') return vol > 0;
  if (data.type === 'LAND') return kg > 0 || vol > 0;
  return true;
}

const pricingErrorMessage =
  'Tarification incoherente : AIR exige pricePerKg, SEA exige pricePerVolume, LAND exige au moins un des deux.';

export const createTransitRouteSchema = z
  .object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres'),
    type: z.enum([TransitType.AIR, TransitType.SEA, TransitType.LAND]),
    departureCity: z.string().min(2, 'Ville de depart requise'),
    departureCountry: z.string().min(2, 'Pays de depart requis'),
    arrivalCity: z.string().min(2, "Ville d'arrivee requise"),
    arrivalCountry: z.string().min(2, "Pays d'arrivee requis"),
    // Les deux prix sont techniquement optionnels au niveau du champ : on
    // applique la regle metier dans le refine final pour pouvoir produire un
    // message clair par type de route.
    pricePerKg: z.number().nonnegative('Le prix par kg ne peut pas etre negatif').optional().default(0),
    pricePerVolume: z.number().nonnegative('Le prix par m3 ne peut pas etre negatif').optional().default(0),
    estimatedDurationDays: z.number().int().min(0).optional().default(0),
  })
  .refine((d) => checkPricing(d), {
    message: pricingErrorMessage,
    path: ['pricePerKg'],
  });

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
    pricePerKg: z.number().nonnegative().optional(),
    pricePerVolume: z.number().nonnegative().optional(),
    estimatedDurationDays: z.number().int().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    // Si le type est explicitement update (avec ou sans prix), on exige que
    // les prix fournis (ou existants implicitement 0) couvrent le type.
    // Si seul un prix est fourni sans type, on ne peut pas verifier sans
    // hitter la DB -> la verification cote use case backend reste source de
    // verite. Ici on couvre uniquement le cas frontend ou les deux sont
    // saisis (l'edit form renvoie les 3 champs).
    if (data.type !== undefined) {
      if (!checkPricing(data)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: pricingErrorMessage,
          path: ['pricePerKg'],
        });
      }
    }
  });

export type CreateTransitRouteInput = z.infer<typeof createTransitRouteSchema>;
export type UpdateTransitRouteInput = z.infer<typeof updateTransitRouteSchema>;
