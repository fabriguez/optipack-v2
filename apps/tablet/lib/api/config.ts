import { apiClient } from './client';

// ── System Config ──────────────────────────────────────────

export const configApi = {
  list: () =>
    apiClient.get('/config').then((r) => r.data),

  update: (key: string, value: string) =>
    apiClient.put(`/config/${key}`, { value }).then((r) => r.data),
};

// ── Currencies ─────────────────────────────────────────────

export interface CurrencyInput {
  code: string;
  name: string;
  symbol: string;
  exchangeRate: number;
  isBase?: boolean;
}

export const currenciesApi = {
  list: () =>
    apiClient.get('/currencies').then((r) => r.data),

  create: (data: CurrencyInput) =>
    apiClient.post('/currencies', data).then((r) => r.data),

  update: (id: string, data: Partial<CurrencyInput & { isActive: boolean }>) =>
    apiClient.patch(`/currencies/${id}`, data).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`/currencies/${id}`).then((r) => r.data),
};

// ── Reports ────────────────────────────────────────────────

export interface ReportParams {
  startDate?: string;
  endDate?: string;
  agencyId?: string;
  status?: string;
}

export const reportsApi = {
  parcels: (params: ReportParams) =>
    apiClient.get('/reports/parcels', { params }).then((r) => r.data),

  payments: (params: ReportParams) =>
    apiClient.get('/reports/payments', { params }).then((r) => r.data),

  revenue: (params: ReportParams) =>
    apiClient.get('/reports/revenue', { params }).then((r) => r.data),

  debts: (params: ReportParams) =>
    apiClient.get('/reports/debts', { params }).then((r) => r.data),

  cashFlow: (params: ReportParams) =>
    apiClient.get('/reports/cash-flow', { params }).then((r) => r.data),

  penalties: (params: ReportParams) =>
    apiClient.get('/reports/penalties', { params }).then((r) => r.data),
};
