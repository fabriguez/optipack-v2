import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const STORAGE_KEY = 'transitsoftservices_client_token';

export const portalClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach client JWT from localStorage
portalClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem(STORAGE_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor: redirect on 401
portalClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      window.location.href = '/portal';
    }
    return Promise.reject(error);
  },
);

// ---- Auth helpers ----

export function getClientToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setClientToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, token);
  }
}

export function removeClientToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function isClientAuthenticated(): boolean {
  return !!getClientToken();
}

// ---- API methods ----

export const clientPortalApi = {
  // Auth
  login: (phone: string, password: string) =>
    portalClient
      .post('/client-portal/login', { phone, password })
      .then((r) => r.data),

  register: (payload: {
    fullName?: string;
    phone: string;
    email?: string;
    password: string;
  }) =>
    portalClient
      .post('/client-portal/register', payload)
      .then((r) => r.data),

  me: () => portalClient.get('/client-portal/me').then((r) => r.data),

  // Reset mot de passe en deux temps (identifiant = email OU telephone).
  // 1) Demande du code OTP (envoye par email + SMS + WhatsApp). Reponse toujours
  //    ok=true cote API (anti-enumeration).
  forgotPassword: (identifier: string) =>
    portalClient
      .post('/client-portal/forgot-password', { identifier })
      .then((r) => r.data),
  // 2) Verifie le code sans le consommer (debloque l'etape mot de passe).
  verifyResetCode: (payload: { identifier: string; code: string }) =>
    portalClient
      .post('/client-portal/verify-reset-code', payload)
      .then((r) => r.data),
  // 3) Applique le nouveau mot de passe.
  resetPassword: (payload: { identifier: string; code: string; newPassword: string }) =>
    portalClient
      .post('/client-portal/reset-password', payload)
      .then((r) => r.data),

  // Profile + KYC
  updateProfile: (data: { fullName?: string; phone?: string; email?: string; address?: string }) =>
    portalClient.patch('/client-portal/me', data).then((r) => r.data),

  uploadDocument: (slot: 'avatar' | 'idDocument' | 'idDocumentBack', file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('slot', slot);
    return portalClient
      .post('/client-portal/me/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },

  // Dashboard
  getDashboard: () =>
    portalClient.get('/client-portal/dashboard').then((r) => r.data),

  // Parcels
  getParcels: (params?: { page?: number; limit?: number; search?: string }) =>
    portalClient
      .get('/client-portal/parcels', { params })
      .then((r) => r.data),

  getParcelByTracking: (tracking: string) =>
    portalClient
      .get(`/client-portal/parcels/${tracking}`)
      .then((r) => r.data),

  // Invoices
  getInvoices: (params?: { page?: number; limit?: number }) =>
    portalClient
      .get('/client-portal/invoices', { params })
      .then((r) => r.data),

  // Payments
  getPayments: (params?: { page?: number; limit?: number }) =>
    portalClient
      .get('/client-portal/payments', { params })
      .then((r) => r.data),

  declarePayment: (payload: {
    invoiceId: string;
    amount: number;
    paymentMethod: string;
    transactionReference?: string;
    note?: string;
  }) =>
    portalClient
      .post('/client-portal/payments/declare', payload)
      .then((r) => r.data),

  // Debts
  getDebts: (params?: { page?: number; limit?: number }) =>
    portalClient
      .get('/client-portal/debts', { params })
      .then((r) => r.data),

  // Notifications
  getNotifications: (params?: { page?: number; limit?: number }) =>
    portalClient
      .get('/client-portal/notifications', { params })
      .then((r) => r.data),

  markNotificationRead: (id: string) =>
    portalClient
      .post(`/client-portal/notifications/${id}/read`)
      .then((r) => r.data),

  markAllNotificationsRead: () =>
    portalClient
      .post('/client-portal/notifications/read-all')
      .then((r) => r.data),

  // Conversations
  getConversations: () =>
    portalClient.get('/client-portal/conversations').then((r) => r.data),

  createConversation: (payload: {
    agencyId?: string;
    firstMessage?: string;
  }) =>
    portalClient
      .post('/client-portal/conversations', payload)
      .then((r) => r.data),

  getConversationMessages: (id: string) =>
    portalClient
      .get(`/client-portal/conversations/${id}/messages`)
      .then((r) => r.data),

  sendConversationMessage: (id: string, message: string) =>
    portalClient
      .post(`/client-portal/conversations/${id}/messages`, { message })
      .then((r) => r.data),

  markConversationRead: (id: string) =>
    portalClient
      .post(`/client-portal/conversations/${id}/read`)
      .then((r) => r.data),

  // Agencies
  getAgencies: () =>
    portalClient.get('/client-portal/agencies').then((r) => r.data),
};
