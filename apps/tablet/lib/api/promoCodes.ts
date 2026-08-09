import { apiClient } from './client';

/** Verdict d'eligibilite d'un code sur une facture donnee. */
export type PromoEvaluation =
  | { ok: false; reason: string; message: string }
  | { ok: true; discountAmount: number; eligibleBase: number };

/** Code proposable au guichet, avec son verdict deja calcule par l'API. */
export interface PromoCandidate {
  id: string;
  code: string;
  label: string;
  description: string | null;
  discountType: 'PERCENT' | 'AMOUNT';
  discountValue: number;
  visibility: string;
  startsAt: string | null;
  expiresAt: string | null;
  source: 'ASSIGNED' | 'PUBLIC';
  remainingUses: number | null;
  evaluation: PromoEvaluation;
}

export interface InvoicePromoCandidates {
  applied: { code: string | null; label: string | null; discountAmount: number } | null;
  candidates: PromoCandidate[];
}

/**
 * Codes promo au guichet : lister ceux du client applicables a une facture,
 * puis les appliquer ou les retirer au nom du client.
 */
export const invoicePromoApi = {
  available: (invoiceId: string): Promise<{ data: InvoicePromoCandidates }> =>
    apiClient.get(`/invoices/${invoiceId}/promo-code/available`).then((r) => r.data),
  apply: (invoiceId: string, code: string) =>
    apiClient.post(`/invoices/${invoiceId}/promo-code`, { code }).then((r) => r.data),
  remove: (invoiceId: string) =>
    apiClient.delete(`/invoices/${invoiceId}/promo-code`).then((r) => r.data),
};
