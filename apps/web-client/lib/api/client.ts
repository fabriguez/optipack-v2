import axios from 'axios';
import { getApiBaseUrl } from './baseUrl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const TOKEN_KEY = 'optipack_client_token';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  // Multi-tenant : derive l'URL de l'API du host courant a l'execution (le
  // baseURL fige au build pointe sur une URL generique). Cote navigateur
  // <slug>.<base> -> api.<slug>.<base>. SSR/localhost -> NEXT_PUBLIC_API_URL.
  config.baseURL = getApiBaseUrl();
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?reason=expired';
      }
    }
    return Promise.reject(err);
  },
);

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export interface LoginResponse {
  accessToken: string;
  client: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
  };
}

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH';
/** Map { [eventKind]: { channels: [...] } } — meme forme que cote API. */
export type NotificationPrefs = Record<string, { channels: NotificationChannel[] }>;

export interface ClientProfile {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  idNumber: string | null;
  imageUrl: string | null;
  address: string | null;
  idVerificationStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  idExpiryDate: string | null;
  loyaltyTier: string | null;
  loyaltyPoints: number;
  totalSpent?: number | string | null;
  /** True si le client dispose d'une tarification partenaire dediee. */
  isPartner?: boolean;
  notificationPrefs: NotificationPrefs | null;
  agency: { id: string; name: string; city: string; phone: string } | null;
}

/** Une ligne de tarif partenaire dedie (cf. GET /client-portal/my-tariffs). */
export interface MyTariff {
  id: string;
  route: {
    id: string;
    name: string;
    type: 'AIR' | 'SEA' | 'LAND';
    departureCity: string;
    departureCountry: string;
    arrivalCity: string;
    arrivalCountry: string;
    estimatedDurationDays: number;
  };
  /** Unite de facturation pertinente selon le type ('kg' ou 'm3'). */
  unit: 'kg' | 'm3';
  partnerPricePerKg: number;
  partnerPricePerVolume: number;
  standardPricePerKg: number;
  standardPricePerVolume: number;
  /** Prix partenaire applicable (selon l'unite). */
  partnerPrice: number;
  /** Prix standard de la route (selon l'unite). */
  standardPrice: number;
  savings: number;
  savingsPercent: number;
  isAdvantage: boolean;
}

/** Route de transit exposee publiquement pour le simulateur. */
export interface PublicTransitRoute {
  id: string;
  name: string;
  type: 'AIR' | 'SEA' | 'LAND';
  departureCity: string;
  departureCountry: string;
  arrivalCity: string;
  arrivalCountry: string;
  pricePerKg: number | null;
  pricePerVolume: number | null;
  estimatedDurationDays: number;
  /** Unite de facturation pertinente selon le type ('kg' ou 'm3'). */
  unit: 'kg' | 'm3';
}

/** Resultat d'une simulation de prix (POST /public/simulate-price). */
export interface PriceSimulation {
  route: {
    id: string;
    name: string;
    type: 'AIR' | 'SEA' | 'LAND';
    departureCity: string;
    departureCountry: string;
    arrivalCity: string;
    arrivalCountry: string;
    estimatedDurationDays: number;
    unit: 'kg' | 'm3';
  };
  weight: number | null;
  volume: number | null;
  price: number;
  standardPrice: number;
  breakdown: {
    mode: 'weight' | 'volume' | 'max';
    weight: number;
    volume: number | null;
    ratePerKg: number;
    ratePerVolume: number;
    rateSource: 'route' | 'partner';
    priceByWeight: number;
    priceByVolume: number;
    basePrice: number;
  };
  /** True si le client connecte est partenaire. */
  isPartner: boolean;
  /** True si un tarif partenaire a effectivement ete applique sur cette route. */
  partnerApplied: boolean;
  /** Economie (FCFA) vs tarif standard quand un tarif partenaire s'applique. */
  savings: number;
}

export interface RegisterPayload {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
}

/** Filtres communs de l'historique (colis / factures / paiements). */
export interface HistoryQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  /** Borne basse (YYYY-MM-DD ou ISO). */
  from?: string;
  /** Borne haute (YYYY-MM-DD ou ISO, inclusive jusqu'a fin de journee). */
  to?: string;
}

/**
 * Telecharge un PDF authentifie (le token est ajoute par l'intercepteur axios)
 * en blob, puis l'ouvre dans un nouvel onglet. Revoque l'URL apres 60s.
 */
async function downloadPdf(path: string, filename: string): Promise<void> {
  const res = await apiClient.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  if (typeof window !== 'undefined') {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const portalApi = {
  // identifier = telephone OU email (le backend resout selon la presence de '@').
  login: (identifier: string, password: string) =>
    apiClient
      .post<{ data: LoginResponse }>('/client-portal/login', { identifier, password })
      .then((r) => r.data.data),

  register: (payload: RegisterPayload) =>
    apiClient
      .post<{ data: LoginResponse }>('/client-portal/register', payload)
      .then((r) => r.data.data),

  forgotPassword: (phone: string) =>
    apiClient
      .post('/client-portal/forgot-password', { phone })
      .then((r) => r.data.data),

  resetPassword: (payload: { phone: string; code: string; newPassword: string }) =>
    apiClient
      .post('/client-portal/reset-password', payload)
      .then((r) => r.data.data),

  // ---- Profil ----
  getMe: (): Promise<ClientProfile> =>
    apiClient.get('/client-portal/me').then((r) => r.data.data),

  // email exclu volontairement : non modifiable cote portail client.
  updateProfile: (payload: { fullName?: string; phone?: string; address?: string }) =>
    apiClient.patch('/client-portal/me', payload).then((r) => r.data.data),

  uploadAvatar: (file: File): Promise<{ url: string; key: string; slot: string }> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('slot', 'avatar');
    return apiClient
      .post('/client-portal/me/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data);
  },

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient
      .post('/client-portal/me/password', { currentPassword, newPassword })
      .then((r) => r.data),

  getNotificationPrefs: (): Promise<NotificationPrefs> =>
    apiClient.get('/client-portal/me/notification-prefs').then((r) => r.data.data),

  updateNotificationPrefs: (prefs: NotificationPrefs) =>
    apiClient.put('/client-portal/me/notification-prefs', prefs).then((r) => r.data),

  getDashboard: () =>
    apiClient.get('/client-portal/dashboard').then((r) => r.data.data),

  // ---- Tarifs partenaire ----
  getMyTariffs: (): Promise<MyTariff[]> =>
    apiClient.get('/client-portal/my-tariffs').then((r) => r.data.data),

  getParcels: (params?: HistoryQuery) =>
    apiClient
      .get('/client-portal/parcels', { params })
      .then((r) => r.data),

  getInvoices: (params?: HistoryQuery) =>
    apiClient
      .get('/client-portal/invoices', { params })
      .then((r) => r.data),

  getInvoiceById: (id: string) =>
    apiClient
      .get(`/client-portal/invoices/${id}`)
      .then((r) => r.data.data),

  getPayments: (params?: HistoryQuery) =>
    apiClient
      .get('/client-portal/payments', { params })
      .then((r) => r.data),

  /** Telecharge une facture PDF (ouvre dans un nouvel onglet). */
  downloadInvoicePdf: (id: string, reference?: string) =>
    downloadPdf(`/client-portal/invoices/${id}/pdf`, `facture-${reference ?? id}.pdf`),

  /** Telecharge un recu de paiement PDF (ouvre dans un nouvel onglet). */
  downloadReceiptPdf: (id: string, reference?: string) =>
    downloadPdf(`/client-portal/payments/${id}/pdf`, `recu-${reference ?? id}.pdf`),

  getParcelByTracking: (tracking: string) =>
    apiClient
      .get(`/client-portal/parcels/${tracking}`)
      .then((r) => r.data.data),

  /** Telecharge le ticket/etiquette d'un colis (ouvre dans un nouvel onglet). */
  downloadParcelLabel: (tracking: string) =>
    downloadPdf(
      `/client-portal/parcels/${encodeURIComponent(tracking)}/label`,
      `ticket-${tracking}.pdf`,
    ),

  /** Declare un paiement (l'agence valide ensuite). */
  declarePayment: (payload: { invoiceId: string; amount: number; paymentMethod?: string }) =>
    apiClient
      .post('/client-portal/payments/declare', {
        paymentMethod: 'MOBILE_MONEY',
        ...payload,
      })
      .then((r) => r.data.data),

  registerParcel: (payload: {
    description: string;
    weight: number;
    receiverName: string;
    receiverPhone: string;
    receiverCity: string;
    receiverAddress?: string;
    senderCity: string;
    serviceType?: 'STANDARD' | 'EXPRESS' | 'SAME_DAY';
  }) =>
    apiClient
      .post('/client-portal/parcels', payload)
      .then((r) => r.data.data),

  getAgencies: () =>
    apiClient.get('/client-portal/agencies').then((r) => r.data.data),

  // ---- Support (Stream Chat) ----
  /** Jeton Stream pour init le SDK chat cote client (channel support unique). */
  supportToken: (): Promise<{
    apiKey: string;
    token: string;
    userId: string;
    channelId: string;
  }> =>
    apiClient
      .post('/client-portal/support/token')
      .then((r) => r.data.data),

  // ---- Simulateur de prix (public ; le token client, s'il existe, est ajoute
  // par l'intercepteur et permet d'appliquer le tarif partenaire) ----
  getPublicTransitRoutes: (): Promise<PublicTransitRoute[]> =>
    apiClient.get('/public/transit-routes').then((r) => r.data.data),

  simulatePrice: (payload: {
    transitRouteId: string;
    weight?: number;
    volume?: number;
  }): Promise<PriceSimulation> =>
    apiClient.post('/public/simulate-price', payload).then((r) => r.data.data),

  // ---- Payments ----
  createCheckout: (payload: import('@transitsoftservices/payments').CheckoutInput) =>
    apiClient
      .post('/client-portal/payments/checkout', payload)
      .then((r) => r.data.data as {
        order: import('@transitsoftservices/payments').PaymentOrder;
        attempt: import('@transitsoftservices/payments').ChargeAttempt;
      }),

  getPaymentOrder: (id: string) =>
    apiClient
      .get(`/client-portal/payments/orders/${id}`)
      .then((r) => r.data.data as import('@transitsoftservices/payments').PaymentOrder),

  // ---- Tenant config (Studio admin) ----
  patchEmailConfig: (
    payload: Partial<import('@transitsoftservices/shared').EmailConfig>,
  ) =>
    apiClient
      .patch('/tenant-meta/email-config', payload)
      .then((r) => r.data.data as { id: string; emailConfig: import('@transitsoftservices/shared').EmailConfigPublic | null }),

  verifyEmailDomain: () =>
    apiClient.post('/tenant-meta/email-config/verify').then((r) => r.data.data as {
      status: 'pending' | 'verified' | 'failed';
      dnsRecords: Array<{ type: 'TXT' | 'CNAME' | 'MX'; name: string; value: string }>;
      message?: string;
    }),

  patchMobileAppConfig: (
    payload: Partial<import('@transitsoftservices/shared').MobileAppConfig>,
  ) =>
    apiClient
      .patch('/tenant-meta/mobile-app-config', payload)
      .then((r) => r.data.data as { id: string; mobileAppConfig: import('@transitsoftservices/shared').MobileAppConfig }),

  /** Stripe : ask the server for a PaymentIntent client_secret (server-side mode keeps key off the client). */
  createStripeIntent: (payload: {
    amount: number;
    currency: string;
    reference: string;
    referenceType: 'PARCEL' | 'INVOICE' | 'TOPUP';
    idempotencyKey: string;
  }) =>
    apiClient
      .post('/client-portal/payments/stripe/intent', payload)
      .then((r) => r.data.data as { clientSecret: string; publishableKey: string; orderId: string }),
};

