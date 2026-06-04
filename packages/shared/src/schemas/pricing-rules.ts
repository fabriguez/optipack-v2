import { z } from 'zod';
import { TransitType } from '../constants/enums';

/**
 * Regle metier de tarification selon le type de transport. Partagee par les
 * routes de transit ET la tarification partenaire pour garantir un comportement
 * identique cote validation :
 *  - AIR  -> facturation au kg uniquement (pricePerKg > 0 obligatoire)
 *  - SEA  -> facturation au m3 uniquement (pricePerVolume > 0 obligatoire)
 *  - LAND -> les deux acceptes, au moins un des deux > 0
 *
 * Le champ inutilise (pricePerVolume pour AIR, pricePerKg pour SEA) est
 * persiste a 0 -- ce qui rend impossible le calcul de prix dans le mauvais mode
 * cote backend (PricingService verifie le mode actif de la route).
 */
export interface PricingShape {
  type?: 'AIR' | 'SEA' | 'LAND';
  pricePerKg?: number | null;
  pricePerVolume?: number | null;
}

/**
 * Validation Zod (superRefine) : ajoute les issues sur le bon champ selon le
 * type. Utilisee par createTransitRouteSchema / updateTransitRouteSchema.
 */
export function validatePricing(data: PricingShape, ctx: z.RefinementCtx): void {
  const kg = data.pricePerKg ?? 0;
  const vol = data.pricePerVolume ?? 0;
  if (data.type === TransitType.AIR) {
    if (kg <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Une route aerienne exige un prix au kilogramme superieur a 0.',
        path: ['pricePerKg'],
      });
    }
  } else if (data.type === TransitType.SEA) {
    if (vol <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Une route maritime exige un prix au metre cube superieur a 0.',
        path: ['pricePerVolume'],
      });
    }
  } else if (data.type === TransitType.LAND) {
    if (kg <= 0 && vol <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Une route terrestre exige au moins un prix au kg ou au m3.',
        path: ['pricePerKg'],
      });
    }
  }
}

/**
 * Variante imperative pour usage hors Zod (ex: controller backend ou form
 * front qui connait le type via la route selectionnee). Renvoie un message
 * d'erreur si la combinaison est invalide, sinon null.
 */
export function checkPricingForType(
  type: 'AIR' | 'SEA' | 'LAND' | undefined,
  pricePerKg?: number | null,
  pricePerVolume?: number | null,
): string | null {
  const kg = pricePerKg ?? 0;
  const vol = pricePerVolume ?? 0;
  if (type === TransitType.AIR && kg <= 0) {
    return 'Une route aerienne exige un prix au kilogramme superieur a 0.';
  }
  if (type === TransitType.SEA && vol <= 0) {
    return 'Une route maritime exige un prix au metre cube superieur a 0.';
  }
  if (type === TransitType.LAND && kg <= 0 && vol <= 0) {
    return 'Une route terrestre exige au moins un prix au kg ou au m3.';
  }
  return null;
}
