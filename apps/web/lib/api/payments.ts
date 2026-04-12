import { apiClient } from './client';
import type { RecordPaymentInput, PaginationInput } from '@optipack/shared';

export const paymentsApi = {
  list: (params?: Partial<PaginationInput> & { agencyId?: string }) =>
    apiClient.get('/payments', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get(`/payments/${id}`).then((r) => r.data),
  getByInvoice: (invoiceId: string) =>
    apiClient.get(`/payments/invoice/${invoiceId}`).then((r) => r.data),
  record: (data: RecordPaymentInput) =>
    apiClient.post('/payments', data).then((r) => r.data),
  void: (id: string, reason: string) =>
    apiClient.post(`/payments/${id}/void`, { reason }).then((r) => r.data),
};
