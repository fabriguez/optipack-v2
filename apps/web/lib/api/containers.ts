import { apiClient } from './client';
import type { CreateContainerInput, PaginationInput } from '@optipack/shared';

export const containersApi = {
  list: (params?: Partial<PaginationInput> & { status?: string }) =>
    apiClient.get('/containers', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get(`/containers/${id}`).then((r) => r.data),
  getParcels: (id: string) =>
    apiClient.get(`/containers/${id}/parcels`).then((r) => r.data),
  create: (data: CreateContainerInput) =>
    apiClient.post('/containers', data).then((r) => r.data),
  loadParcels: (id: string, parcelIds: string[]) =>
    apiClient.post(`/containers/${id}/load`, { parcelIds }).then((r) => r.data),
  depart: (id: string) =>
    apiClient.post(`/containers/${id}/depart`).then((r) => r.data),
  arrive: (id: string) =>
    apiClient.post(`/containers/${id}/arrive`).then((r) => r.data),
  unload: (id: string, data: { parcelId: string; action: string; warehouseId: string; newWeight?: number; comment?: string }) =>
    apiClient.post(`/containers/${id}/unload`, data).then((r) => r.data),
};
