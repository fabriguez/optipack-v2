import { apiClient } from './client';
import type { CreateParcelInput, PaginationInput } from '@optipack/shared';

export const parcelsApi = {
  list: (params?: Partial<PaginationInput> & { status?: string; clientId?: string; warehouseId?: string }) =>
    apiClient.get('/parcels', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get(`/parcels/${id}`).then((r) => r.data),
  getByTracking: (tracking: string) =>
    apiClient.get(`/parcels/tracking/${tracking}`).then((r) => r.data),
  create: (data: CreateParcelInput) =>
    apiClient.post('/parcels', data).then((r) => r.data),
  updateStatus: (id: string, status: string) =>
    apiClient.patch(`/parcels/${id}/status`, { status }).then((r) => r.data),
};
