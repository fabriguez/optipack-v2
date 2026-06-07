import { apiClient } from './client';
import type { PaginationInput } from '@transitsoftservices/shared';

/** Endpoints routes de transit (mirror web /transit-routes). */
export const transitRoutesApi = {
  list: (params?: Partial<PaginationInput> & { type?: string; isActive?: string }) =>
    apiClient.get('/transit-routes', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get(`/transit-routes/${id}`).then((r) => r.data),
  create: (data: unknown) =>
    apiClient.post('/transit-routes', data).then((r) => r.data),
  update: (id: string, data: unknown) =>
    apiClient.patch(`/transit-routes/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    apiClient.delete(`/transit-routes/${id}`).then((r) => r.data),
};
