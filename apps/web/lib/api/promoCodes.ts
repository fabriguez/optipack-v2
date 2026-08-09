import { apiClient } from './client';
import type {
  AssignPromoCodeInput,
  CreatePromoCodeInput,
  PaginationInput,
  UpdatePromoCodeInput,
} from '@transitsoftservices/shared';

export interface PromoCodeRoute {
  transitRoute: { id: string; name: string; type: string };
}

export interface PromoCode {
  id: string;
  code: string;
  label: string;
  description: string | null;
  discountType: 'PERCENT' | 'AMOUNT';
  discountValue: number | string;
  maxDiscountAmount: number | string | null;
  minOrderAmount: number | string | null;
  maxOrderAmount: number | string | null;
  parcelCategories: string[];
  transitTypes: string[];
  startsAt: string | null;
  expiresAt: string | null;
  maxUses: number | null;
  maxUsesPerClient: number | null;
  usedCount: number;
  visibility: 'PUBLIC' | 'PRIVATE' | 'ASSIGNED';
  isActive: boolean;
  createdAt: string;
  routes?: PromoCodeRoute[];
  _count?: { assignments: number; redemptions: number };
}

export interface PromoCodeAssignment {
  id: string;
  clientId: string;
  maxUses: number | null;
  usedCount: number;
  createdAt: string;
  client: { id: string; fullName: string; phone: string | null; email: string | null };
}

export interface PromoCodeRedemption {
  id: string;
  discountAmount: number | string;
  eligibleBase: number | string;
  codeSnapshot: string;
  status: 'RESERVED' | 'CONSUMED' | 'RELEASED';
  createdAt: string;
  consumedAt: string | null;
  releasedAt: string | null;
  client: { id: string; fullName: string };
  invoice: { id: string; reference: string; status: string };
}

export interface PromoCodeFilters extends Partial<PaginationInput> {
  search?: string;
  isActive?: boolean;
  visibility?: string;
  activeOnly?: boolean;
}

export const promoCodesApi = {
  list: (params?: PromoCodeFilters) =>
    apiClient.get('/promo-codes', { params }).then((r) => r.data),
  getById: (id: string) => apiClient.get(`/promo-codes/${id}`).then((r) => r.data),
  create: (data: CreatePromoCodeInput) =>
    apiClient.post('/promo-codes', data).then((r) => r.data),
  update: (id: string, data: UpdatePromoCodeInput) =>
    apiClient.patch(`/promo-codes/${id}`, data).then((r) => r.data),
  delete: (id: string) => apiClient.delete(`/promo-codes/${id}`).then((r) => r.data),

  // Attributions nominatives
  listAssignments: (id: string, params?: Partial<PaginationInput> & { search?: string }) =>
    apiClient.get(`/promo-codes/${id}/assignments`, { params }).then((r) => r.data),
  assign: (id: string, data: AssignPromoCodeInput) =>
    apiClient.post(`/promo-codes/${id}/assignments`, data).then((r) => r.data),
  unassign: (id: string, clientId: string) =>
    apiClient.delete(`/promo-codes/${id}/assignments/${clientId}`).then((r) => r.data),

  // Historique d'utilisation
  listRedemptions: (id: string, params?: Partial<PaginationInput>) =>
    apiClient.get(`/promo-codes/${id}/redemptions`, { params }).then((r) => r.data),
};

/** Application d'un code promo sur une facture depuis le guichet. */
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

export const invoicePromoApi = {
  /** Codes du client mobilisables sur cette facture (eligibles ou non). */
  available: (invoiceId: string): Promise<{ data: InvoicePromoCandidates }> =>
    apiClient.get(`/invoices/${invoiceId}/promo-code/available`).then((r) => r.data),
  preview: (invoiceId: string, code: string) =>
    apiClient.post(`/invoices/${invoiceId}/promo-code/preview`, { code }).then((r) => r.data),
  apply: (invoiceId: string, code: string) =>
    apiClient.post(`/invoices/${invoiceId}/promo-code`, { code }).then((r) => r.data),
  remove: (invoiceId: string) =>
    apiClient.delete(`/invoices/${invoiceId}/promo-code`).then((r) => r.data),
};
