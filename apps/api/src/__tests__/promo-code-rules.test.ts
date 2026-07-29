import { describe, expect, it } from 'vitest';
import {
  computeEligibleBase,
  computeRawDiscount,
  evaluatePromoCode,
  normalizePromoCode,
  remainingUsesForClient,
  type PromoCodeRules,
  type PromoParcelView,
} from '../application/services/promo/promoCodeRules';

const NOW = new Date('2026-07-29T12:00:00Z');

function makePromo(overrides: Partial<PromoCodeRules> = {}): PromoCodeRules {
  return {
    discountType: 'PERCENT',
    discountValue: 10,
    maxDiscountAmount: null,
    minOrderAmount: null,
    maxOrderAmount: null,
    parcelCategories: [],
    transitTypes: [],
    transitRouteIds: [],
    startsAt: null,
    expiresAt: null,
    maxUses: null,
    maxUsesPerClient: null,
    usedCount: 0,
    visibility: 'PUBLIC',
    isActive: true,
    isDeleted: false,
    ...overrides,
  };
}

const parcel = (o: Partial<PromoParcelView> = {}): PromoParcelView => ({
  price: 10_000,
  category: 'STANDARD',
  transitRouteId: 'route-1',
  transitType: 'AIR',
  ...o,
});

function evaluate(
  promo: Partial<PromoCodeRules>,
  opts: {
    parcels?: PromoParcelView[];
    totalAmount?: number;
    balance?: number;
    usage?: { assignment?: { id: string; maxUses: number | null; usedCount: number } | null; clientUsedCount?: number };
    hasActiveRedemption?: boolean;
  } = {},
) {
  return evaluatePromoCode({
    promo: makePromo(promo),
    invoice: {
      totalAmount: opts.totalAmount ?? 20_000,
      balance: opts.balance ?? 20_000,
      status: 'UNPAID',
    },
    parcels: opts.parcels ?? [parcel(), parcel()],
    usage: {
      assignment: opts.usage?.assignment ?? null,
      clientUsedCount: opts.usage?.clientUsedCount ?? 0,
    },
    hasActiveRedemption: opts.hasActiveRedemption ?? false,
    now: NOW,
  });
}

describe('normalizePromoCode', () => {
  it('met en majuscules et retire espaces et tirets', () => {
    expect(normalizePromoCode(' ete-2026 ')).toBe('ETE2026');
    expect(normalizePromoCode('noel 25')).toBe('NOEL25');
  });
});

describe('computeEligibleBase', () => {
  const scopeless: Pick<
    PromoCodeRules,
    'parcelCategories' | 'transitTypes' | 'transitRouteIds'
  > = { parcelCategories: [], transitTypes: [], transitRouteIds: [] };

  it('sans perimetre, prend le brut de la facture (couvre magasinage et agregats)', () => {
    expect(computeEligibleBase(scopeless, { totalAmount: 50_000 }, [])).toBe(50_000);
  });

  it('filtre par categorie de colis', () => {
    const base = computeEligibleBase(
      { ...scopeless, parcelCategories: ['ELECTRONICS'] },
      { totalAmount: 30_000 },
      [parcel({ category: 'ELECTRONICS', price: 12_000 }), parcel({ category: 'FOOD', price: 8_000 })],
    );
    expect(base).toBe(12_000);
  });

  it('filtre par route de transit', () => {
    const base = computeEligibleBase(
      { ...scopeless, transitRouteIds: ['route-2'] },
      { totalAmount: 30_000 },
      [parcel({ transitRouteId: 'route-1' }), parcel({ transitRouteId: 'route-2', price: 7_000 })],
    );
    expect(base).toBe(7_000);
  });

  it('exclut les colis sans route quand le code cible des routes', () => {
    const base = computeEligibleBase(
      { ...scopeless, transitRouteIds: ['route-1'] },
      { totalAmount: 10_000 },
      [parcel({ transitRouteId: null })],
    );
    expect(base).toBe(0);
  });

  it('ne depasse jamais le brut de la facture', () => {
    const base = computeEligibleBase(
      { ...scopeless, transitTypes: ['AIR'] },
      { totalAmount: 5_000 },
      [parcel({ price: 10_000 })],
    );
    expect(base).toBe(5_000);
  });
});

describe('computeRawDiscount', () => {
  it('applique un pourcentage', () => {
    expect(computeRawDiscount({ discountType: 'PERCENT', discountValue: 15, maxDiscountAmount: null }, 20_000)).toBe(3_000);
  });

  it('plafonne le pourcentage', () => {
    expect(computeRawDiscount({ discountType: 'PERCENT', discountValue: 50, maxDiscountAmount: 2_000 }, 20_000)).toBe(2_000);
  });

  it('borne un montant fixe a l assiette', () => {
    expect(computeRawDiscount({ discountType: 'AMOUNT', discountValue: 50_000, maxDiscountAmount: null }, 8_000)).toBe(8_000);
  });
});

describe('remainingUsesForClient', () => {
  it('le quota de l assignation prime sur celui du code', () => {
    const remaining = remainingUsesForClient(
      { maxUsesPerClient: 1 },
      { assignment: { id: 'a', maxUses: 3, usedCount: 1 }, clientUsedCount: 9 },
    );
    expect(remaining).toBe(2);
  });

  it('retombe sur le quota generique sans assignation', () => {
    expect(remainingUsesForClient({ maxUsesPerClient: 2 }, { assignment: null, clientUsedCount: 2 })).toBe(0);
  });

  it('null quand aucune limite', () => {
    expect(remainingUsesForClient({ maxUsesPerClient: null }, { assignment: null, clientUsedCount: 99 })).toBeNull();
  });
});

describe('evaluatePromoCode', () => {
  it('accepte un code valable et calcule la remise', () => {
    const result = evaluate({ discountValue: 10 });
    expect(result).toEqual({ ok: true, discountAmount: 2_000, eligibleBase: 20_000 });
  });

  it('refuse un code inactif', () => {
    expect(evaluate({ isActive: false })).toMatchObject({ ok: false, reason: 'INACTIVE' });
  });

  it('refuse un code pas encore ouvert', () => {
    expect(evaluate({ startsAt: new Date('2026-08-01') })).toMatchObject({ ok: false, reason: 'NOT_STARTED' });
  });

  it('refuse un code expire', () => {
    expect(evaluate({ expiresAt: new Date('2026-07-01') })).toMatchObject({ ok: false, reason: 'EXPIRED' });
  });

  it('refuse un code reserve a un client non assigne', () => {
    expect(evaluate({ visibility: 'ASSIGNED' })).toMatchObject({ ok: false, reason: 'NOT_ASSIGNED' });
  });

  it('accepte un code reserve si le client est assigne', () => {
    const result = evaluate(
      { visibility: 'ASSIGNED' },
      { usage: { assignment: { id: 'a', maxUses: 2, usedCount: 0 } } },
    );
    expect(result.ok).toBe(true);
  });

  it('refuse quand le quota global est atteint', () => {
    expect(evaluate({ maxUses: 5, usedCount: 5 })).toMatchObject({ ok: false, reason: 'GLOBAL_LIMIT_REACHED' });
  });

  it('refuse quand le quota client est atteint', () => {
    expect(
      evaluate({ maxUsesPerClient: 1 }, { usage: { clientUsedCount: 1 } }),
    ).toMatchObject({ ok: false, reason: 'CLIENT_LIMIT_REACHED' });
  });

  it('refuse en dessous du montant minimum', () => {
    expect(evaluate({ minOrderAmount: 50_000 })).toMatchObject({ ok: false, reason: 'BELOW_MIN_AMOUNT' });
  });

  it('refuse au dessus du montant maximum', () => {
    expect(evaluate({ maxOrderAmount: 10_000 })).toMatchObject({ ok: false, reason: 'ABOVE_MAX_AMOUNT' });
  });

  it('refuse si aucun colis n entre dans le perimetre', () => {
    expect(
      evaluate({ parcelCategories: ['DOCUMENT'] }, { parcels: [parcel({ category: 'FOOD' })] }),
    ).toMatchObject({ ok: false, reason: 'NO_ELIGIBLE_PARCEL' });
  });

  it('refuse une facture deja soldee', () => {
    expect(evaluate({}, { balance: 0 })).toMatchObject({ ok: false, reason: 'INVOICE_NOT_PAYABLE' });
  });

  it('refuse un second code sur la meme facture', () => {
    expect(evaluate({}, { hasActiveRedemption: true })).toMatchObject({ ok: false, reason: 'ALREADY_APPLIED' });
  });

  it('borne la remise au reste du quand un acompte a deja ete verse', () => {
    const result = evaluate(
      { discountType: 'AMOUNT', discountValue: 15_000 },
      { totalAmount: 20_000, balance: 4_000 },
    );
    expect(result).toMatchObject({ ok: true, discountAmount: 4_000 });
  });
});
