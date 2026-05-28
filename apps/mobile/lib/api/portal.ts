import { apiClient } from './client';

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
  parcels: (params?: { search?: string; status?: string; limit?: number; page?: number }) =>
    apiClient.get('/client-portal/parcels', { params }).then((r) => r.data),
  parcelById: (id: string) =>
    apiClient.get(`/client-portal/parcels/${id}`).then((r) => r.data),

  // Public tracking (no auth)
  publicTrack: (tracking: string) =>
    apiClient.get(`/public-tracking/${tracking}`).then((r) => r.data),

  // Invoices
  invoices: (params?: { search?: string; status?: string; limit?: number; page?: number }) =>
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

  // Agencies (public-ish for client to choose)
  agencies: () => apiClient.get('/client-portal/agencies').then((r) => r.data),

  // Support
  supportConversations: () => apiClient.get('/client-portal/support').then((r) => r.data),
  sendSupportMessage: (data: { conversationId?: string; content: string }) =>
    apiClient.post('/client-portal/support/message', data).then((r) => r.data),
};
