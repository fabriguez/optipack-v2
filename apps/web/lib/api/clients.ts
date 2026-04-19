import { apiClient } from './client';
import type { CreateClientInput, UpdateClientInput, PaginationInput } from '@transitsoftservices/shared';

export const clientsApi = {
  list: (params?: Partial<PaginationInput> & { agencyId?: string }) =>
    apiClient.get('/clients', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get(`/clients/${id}`).then((r) => r.data),
  create: (data: CreateClientInput) =>
    apiClient.post('/clients', data).then((r) => r.data),
  update: (id: string, data: UpdateClientInput) =>
    apiClient.patch(`/clients/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    apiClient.delete(`/clients/${id}`).then((r) => r.data),
};
