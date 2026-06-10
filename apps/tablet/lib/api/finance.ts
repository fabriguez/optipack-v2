import { apiClient } from './client';
import type {
  CreateDisbursementInput,
  CreateFundTransferInput,
  PaginationInput,
} from '@transitsoftservices/shared';

export const cashRegisterApi = {
  get: (agencyId: string, date?: string) =>
    apiClient.get(`/cash-registers/${agencyId}`, { params: date ? { date } : undefined }).then((r) => r.data),
  movements: (agencyId: string, params?: { page?: number; limit?: number; date?: string; all?: string }) =>
    apiClient.get(`/cash-registers/${agencyId}/movements`, { params }).then((r) => r.data),
  close: (agencyId: string, notes?: string) =>
    apiClient.post(`/cash-registers/${agencyId}/close`, { notes }).then((r) => r.data),
};

export const expensesApi = {
  list: (params?: Partial<PaginationInput> & { agencyId?: string; category?: string }) =>
    apiClient.get('/expenses', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get(`/expenses/${id}`).then((r) => r.data),
  create: (data: unknown) =>
    apiClient.post('/expenses', data).then((r) => r.data),
};

export const debtsApi = {
  list: (params?: Partial<PaginationInput> & { bucket?: string; status?: string; timeFilter?: string }) =>
    apiClient.get('/debts', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get(`/debts/${id}`).then((r) => r.data),
  create: (data: unknown) =>
    apiClient.post('/debts', data).then((r) => r.data),
  void: (id: string, reason: string) =>
    apiClient.post(`/debts/${id}/void`, { reason }).then((r) => r.data),
  adjust: (id: string, data: unknown) =>
    apiClient.post(`/debts/${id}/adjust`, data).then((r) => r.data),
  recordPayment: (id: string, data: unknown) =>
    apiClient.post(`/debts/${id}/payments`, data).then((r) => r.data),
  dashboard: () =>
    apiClient.get('/finance/debt-dashboard').then((r) => r.data),
};

export const financeTimelineApi = {
  list: (params?: { agencyId?: string; types?: string; from?: string; to?: string; limit?: number }) =>
    apiClient.get('/finance/timeline', { params }).then((r) => r.data),
};

export const accountingApi = {
  getLedger: (params?: Partial<PaginationInput> & { agencyId?: string; sourceType?: string }) =>
    apiClient.get('/accounting', { params }).then((r) => r.data),
  getEntry: (id: string) =>
    apiClient.get(`/accounting/${id}`).then((r) => r.data),
};

export const disbursementsApi = {
  list: (params?: Partial<PaginationInput>) =>
    apiClient.get('/disbursements', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get(`/disbursements/${id}`).then((r) => r.data),
  create: (data: CreateDisbursementInput) =>
    apiClient.post('/disbursements', data).then((r) => r.data),
  void: (id: string, reason: string) =>
    apiClient.post(`/disbursements/${id}/void`, { reason }).then((r) => r.data),
};

export const fundTransfersApi = {
  list: (params?: Partial<PaginationInput>) =>
    apiClient.get('/fund-transfers', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get(`/fund-transfers/${id}`).then((r) => r.data),
  create: (data: CreateFundTransferInput) =>
    apiClient.post('/fund-transfers', data).then((r) => r.data),
  confirm: (id: string) =>
    apiClient.post(`/fund-transfers/${id}/confirm`).then((r) => r.data),
  void: (id: string, reason: string) =>
    apiClient.post(`/fund-transfers/${id}/void`, { reason }).then((r) => r.data),
};
