import { apiClient } from './client';

/** Filtres communs de l'historique : recherche, statut, periode, pagination. */
export interface HistoryParams {
  search?: string;
  status?: string;
  /** Borne basse YYYY-MM-DD. */
  from?: string;
  /** Borne haute YYYY-MM-DD (inclusive jusqu'a fin de journee cote API). */
  to?: string;
  limit?: number;
  page?: number;
}

export const portalApi = {
  // Auth
  login: (email: string, password: string) =>
    apiClient.post('/client-portal/login', { email, password }).then((r) => r.data),
  register: (data: { fullName: string; email: string; phone: string; password: string }) =>
    apiClient.post('/client-portal/register', data).then((r) => r.data),
  me: () => apiClient.get('/client-portal/me').then((r) => r.data),

  // Dashboard
  dashboard: () => apiClient.get('/client-portal/dashboard').then((r) => r.data),

  // Parcels
  parcels: (params?: HistoryParams) =>
    apiClient.get('/client-portal/parcels', { params }).then((r) => r.data),
  parcelByTracking: (tracking: string) =>
    apiClient.get(`/client-portal/parcels/${encodeURIComponent(tracking)}`).then((r) => r.data),
  // Compat ascendante : ancienne signature, prend tracking number en arg.
  parcelById: (tracking: string) =>
    apiClient.get(`/client-portal/parcels/${encodeURIComponent(tracking)}`).then((r) => r.data),
  parcelLabelUrl: (tracking: string) => `/client-portal/parcels/${encodeURIComponent(tracking)}/label`,
  invoicePdfUrl: (id: string) => `/client-portal/invoices/${id}/pdf`,
  // Recu de paiement (justificatif PDF) d'un paiement donne.
  paymentReceiptUrl: (id: string) => `/client-portal/payments/${id}/pdf`,

  // Payment intents : flux multi-provider avec fallback.
  initiatePayment: (data: {
    invoiceId: string;
    channel: 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER' | 'USSD';
    amount?: number;
    country?: string;
    payerPhone?: string;
    payerEmail?: string;
    returnUrl?: string;
  }) => apiClient.post('/client-portal/payment-intents', data).then((r) => r.data),
  paymentIntent: (id: string) =>
    apiClient.get(`/client-portal/payment-intents/${id}`).then((r) => r.data),

  // Public tracking (no auth)
  publicTrack: (tracking: string) =>
    apiClient.get(`/public-tracking/${tracking}`).then((r) => r.data),

  // Invoices
  invoices: (params?: HistoryParams) =>
    apiClient.get('/client-portal/invoices', { params }).then((r) => r.data),
  invoiceById: (id: string) =>
    apiClient.get(`/client-portal/invoices/${id}`).then((r) => r.data),

  // Payments
  payments: (params?: { limit?: number; page?: number }) =>
    apiClient.get('/client-portal/payments', { params }).then((r) => r.data),
  payInvoice: (invoiceId: string, data: { amount: number; paymentMethodId?: string; reference?: string }) =>
    apiClient.post(`/client-portal/invoices/${invoiceId}/pay`, data).then((r) => r.data),

  // Debts
  debts: () => apiClient.get('/client-portal/debts').then((r) => r.data),

  // Notifications
  notifications: () => apiClient.get('/client-portal/notifications').then((r) => r.data),
  markNotificationRead: (id: string) =>
    apiClient.post(`/client-portal/notifications/${id}/read`).then((r) => r.data),

  // Push : enregistrement / desenregistrement du token Expo de l'appareil.
  registerPushToken: (token: string) =>
    apiClient.post('/client-portal/push-token', { token }).then((r) => r.data),
  unregisterPushToken: (token: string) =>
    apiClient.delete('/client-portal/push-token', { data: { token } }).then((r) => r.data),

  // Agencies (public-ish for client to choose)
  agencies: () => apiClient.get('/client-portal/agencies').then((r) => r.data),

  // Support
  supportConversations: () => apiClient.get('/client-portal/support').then((r) => r.data),
  sendSupportMessage: (data: { conversationId?: string; content: string }) =>
    apiClient.post('/client-portal/support/message', data).then((r) => r.data),
};
