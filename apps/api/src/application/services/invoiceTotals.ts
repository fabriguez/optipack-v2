/**
 * Source de verite unique cote ECRITURE des montants d'une facture.
 *
 * Invariants (le pendant ecriture de `invoiceView.ts`, qui gere la lecture) :
 *   netAmount = totalAmount - discount - promoDiscount + tva
 *   balance   = netAmount - paidAmount        (jamais negatif)
 *   status    = PAID si balance <= 0, PARTIAL si un acompte existe, sinon UNPAID
 *
 * `discount` est la remise commerciale accordee a la main par un agent,
 * `promoDiscount` celle issue d'un code promo. Les deux se cumulent et sont
 * plafonnees ensemble au brut pour qu'une facture ne puisse jamais devenir
 * negative. Tout endroit qui recalcule une facture doit passer par ici, sinon
 * les deux remises se marchent dessus.
 */

export interface InvoiceAmountsInput {
  totalAmount: number;
  discount?: number;
  promoDiscount?: number;
  tva?: number;
  paidAmount?: number;
  /** Statut courant : seul CANCELLED est preserve tel quel. */
  status?: string;
}

export interface InvoiceAmounts {
  totalAmount: number;
  discount: number;
  promoDiscount: number;
  tva: number;
  netAmount: number;
  paidAmount: number;
  balance: number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
}

/** Somme des remises, bornee au brut pour interdire un net negatif. */
export function cappedDiscounts(
  totalAmount: number,
  discount: number,
  promoDiscount: number,
): { discount: number; promoDiscount: number } {
  const safeDiscount = Math.max(0, Math.min(discount, totalAmount));
  const safePromo = Math.max(0, Math.min(promoDiscount, totalAmount - safeDiscount));
  return { discount: safeDiscount, promoDiscount: safePromo };
}

export function computeInvoiceAmounts(input: InvoiceAmountsInput): InvoiceAmounts {
  const totalAmount = Number(input.totalAmount ?? 0);
  const tva = Number(input.tva ?? 0);
  const paidAmount = Number(input.paidAmount ?? 0);

  const { discount, promoDiscount } = cappedDiscounts(
    totalAmount,
    Number(input.discount ?? 0),
    Number(input.promoDiscount ?? 0),
  );

  const netAmount = totalAmount - discount - promoDiscount + tva;
  const balance = Math.max(0, netAmount - paidAmount);

  const status: InvoiceAmounts['status'] =
    input.status === 'CANCELLED'
      ? 'CANCELLED'
      : balance <= 0
        ? 'PAID'
        : paidAmount > 0
          ? 'PARTIAL'
          : 'UNPAID';

  return { totalAmount, discount, promoDiscount, tva, netAmount, paidAmount, balance, status };
}

/**
 * Champs prets a passer a `prisma.invoice.update({ data })`. Ne renvoie que les
 * colonnes derivees pour ne pas ecraser par megarde le reste de la facture.
 */
export function invoiceAmountsUpdate(input: InvoiceAmountsInput) {
  const a = computeInvoiceAmounts(input);
  return {
    totalAmount: a.totalAmount,
    discount: a.discount,
    promoDiscount: a.promoDiscount,
    tva: a.tva,
    netAmount: a.netAmount,
    balance: a.balance,
    status: a.status,
  };
}
