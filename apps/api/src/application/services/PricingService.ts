import type { TransitRoute, Client } from '@prisma/client';
import { LOYALTY_TIER_DISCOUNTS } from '@optipack/shared';

interface PriceCalculation {
  basePrice: number;
  discountPercent: number;
  discountAmount: number;
  finalPrice: number;
}

export class PricingService {
  static calculate(
    weight: number,
    volume: number | undefined,
    transitRoute: TransitRoute,
    client: Client,
  ): PriceCalculation {
    const pricePerKg = Number(transitRoute.pricePerKg);
    const pricePerVolume = Number(transitRoute.pricePerVolume);

    // Prix = max(prix par poids, prix par volume)
    const priceByWeight = weight * pricePerKg;
    const priceByVolume = volume ? volume * pricePerVolume : 0;
    const basePrice = Math.max(priceByWeight, priceByVolume);

    // Reduction fidelite
    const tier = client.loyaltyTier as keyof typeof LOYALTY_TIER_DISCOUNTS;
    const discountPercent = LOYALTY_TIER_DISCOUNTS[tier] || 0;
    const discountAmount = Math.round(basePrice * discountPercent / 100);
    const finalPrice = basePrice - discountAmount;

    return {
      basePrice: Math.round(basePrice),
      discountPercent,
      discountAmount,
      finalPrice: Math.round(finalPrice),
    };
  }
}
