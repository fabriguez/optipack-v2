import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const TOKEN_KEY = 'optipack_client_token';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
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

export interface RegisterPayload {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
}

export const portalApi = {
  login: (phone: string, password: string) =>
    apiClient
      .post<{ data: LoginResponse }>('/client-portal/login', { phone, password })
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

  getDashboard: () =>
    apiClient.get('/client-portal/dashboard').then((r) => r.data.data),

  getParcels: (params?: { page?: number; limit?: number; search?: string }) =>
    apiClient
      .get('/client-portal/parcels', { params })
      .then((r) => r.data),

  getParcelByTracking: (tracking: string) =>
    apiClient
      .get(`/client-portal/parcels/${tracking}`)
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

