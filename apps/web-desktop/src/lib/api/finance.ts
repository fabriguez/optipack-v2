import { apiClient } from './client';
import type {
  CreateDisbursementInput,
  CreateFundTransferInput,
  PaginationInput,
} from '@transitsoftservices/shared';

export const cashRegisterApi = {
  get: (agencyId: string) =>
    apiClient.get(`/cash-registers/${agencyId}`).then((r) => r.data),
  close: (agencyId: string, notes?: string) =>
    apiClient.post(`/cash-registers/${agencyId}/close`, { notes }).then((r) => r.data),
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
};
