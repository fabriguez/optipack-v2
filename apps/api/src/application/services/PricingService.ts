import type { TransitRoute, Client, PartnerPricing } from '@prisma/client';

/**
 * Resultat detaille du calcul de prix d'un colis.
 *
 * IMPORTANT : la fidelite n'applique PLUS de remise automatique. Les points
 * de fidelite sont desormais convertis manuellement par l'utilisateur en
 * remise (taux configure par l'admin via SystemConfig 'loyalty_points_per_fcfa').
 * Ce service ne retourne donc que le prix de transport pur, base sur la
 * route et l'eventuel tarif partenaire.
 */
export interface PriceBreakdown {
  /** Mode de tarification effectif : on facture par poids, par volume, ou le max des deux. */
  mode: 'weight' | 'volume' | 'max';
  weight: number;
  volume: number | null;
  /** Tarif au kilo applique (FCFA/kg). */
  ratePerKg: number;
  /** Tarif au m3 applique (FCFA/m3). */
  ratePerVolume: number;
  /** Source du tarif : route par defaut ou tarif partenaire client. */
  rateSource: 'route' | 'partner';
  /** ID du PartnerPricing matche, si applicable. */
  partnerPricingId: string | null;
  /** Sous-totaux par axe (utile pour expliquer le mode 'max'). */
  priceByWeight: number;
  priceByVolume: number;
  /** Prix retenu = max des deux quand applicable (avant valeur ajoutee). */
  basePrice: number;
  /** Nature de la valeur ajoutee de la route (montant fixe / pourcentage / aucune). */
  addedValueType: 'AMOUNT' | 'PERCENT' | null;
  /** Valeur ajoutee configuree sur la route (FCFA si AMOUNT, % si PERCENT). */
  addedValueRate: number;
  /** Montant FCFA effectivement ajoute au prix de base. */
  addedValueAmount: number;
}

export interface PriceCalculation {
  basePrice: number;
  /** Conserve a 0 : la fidelite ne fait plus de remise auto. Conservation pour
   *  retro-compat des appelants (Invoice.discount, etc.) qui addressent ce champ. */
  discountPercent: 0;
  discountAmount: 0;
  finalPrice: number;
  /** Detail complet de la formule pour la transparence UI / audit. */
  breakdown: PriceBreakdown;
}

interface PartnerPricingLite {
  id: string;
  pricePerKg: PartnerPricing['pricePerKg'];
  pricePerVolume: PartnerPricing['pricePerVolume'];
}

export class PricingService {
  /**
   * Calcule le prix d'un colis. Si un PartnerPricing est fourni, il est applique
   * en priorite sur le tarif route. Aucune remise fidelite n'est appliquee ici
   * (la conversion points -> FCFA passe par un flux distinct).
   */
  static calculate(
    weight: number,
    volume: number | undefined,
    transitRoute: TransitRoute,
    _client: Client,
    partnerPricing?: PartnerPricingLite | null,
  ): PriceCalculation {
    void _client; // conserve la signature ; client servira pour la conversion points (manuel).

    const ratePerKg = Number(partnerPricing?.pricePerKg ?? transitRoute.pricePerKg);
    const ratePerVolume = Number(partnerPricing?.pricePerVolume ?? transitRoute.pricePerVolume);

    const priceByWeight = Math.round(weight * ratePerKg);
    const priceByVolume = volume ? Math.round(volume * ratePerVolume) : 0;

    // Mode effectif : si on a les 2 mesures, on prend le max ; sinon l'axe disponible.
    let mode: PriceBreakdown['mode'];
    let basePrice: number;
    if (weight > 0 && volume && volume > 0) {
      mode = 'max';
      basePrice = Math.max(priceByWeight, priceByVolume);
    } else if (volume && volume > 0 && weight === 0) {
      mode = 'volume';
      basePrice = priceByVolume;
    } else {
      mode = 'weight';
      basePrice = priceByWeight;
    }

    // Valeur ajoutee de la route : montant fixe (FCFA) ou pourcentage du prix de
    // base. Appliquee apres le calcul du prix de base, avant le prix final.
    const addedValueType = (transitRoute.addedValueType as 'AMOUNT' | 'PERCENT' | null) ?? null;
    const addedValueRate = transitRoute.addedValue != null ? Number(transitRoute.addedValue) : 0;
    let addedValueAmount = 0;
    if (addedValueRate > 0) {
      addedValueAmount =
        addedValueType === 'PERCENT'
          ? Math.round((basePrice * addedValueRate) / 100)
          : Math.round(addedValueRate);
    }
    const finalPrice = basePrice + addedValueAmount;

    const breakdown: PriceBreakdown = {
      mode,
      weight,
      volume: volume ?? null,
      ratePerKg,
      ratePerVolume,
      rateSource: partnerPricing ? 'partner' : 'route',
      partnerPricingId: partnerPricing?.id ?? null,
      priceByWeight,
      priceByVolume,
      basePrice,
      addedValueType,
      addedValueRate,
      addedValueAmount,
    };

    return {
      basePrice,
      discountPercent: 0,
      discountAmount: 0,
      finalPrice,
      breakdown,
    };
  }
}
