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

  // Notifications
  getNotifications: (params?: { page?: number; limit?: number }) =>
    portalClient
      .get('/client-portal/notifications', { params })
      .then((r) => r.data),

  markNotificationRead: (id: string) =>
    portalClient
      .patch(`/client-portal/notifications/${id}/read`)
      .then((r) => r.data),

  // Agencies
  getAgencies: () =>
    portalClient.get('/client-portal/agencies').then((r) => r.data),
};
