import { apiClient } from './client';
import type { CreateParcelInput, UpdateParcelInput, PaginationInput } from '@transitsoftservices/shared';

export interface ParcelImage {
  id: string;
  parcelId: string;
  url: string;
  caption: string | null;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
}

export const parcelsApi = {
  list: (params?: Partial<PaginationInput> & { status?: string; clientId?: string; warehouseId?: string }) =>
    apiClient.get('/parcels', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get(`/parcels/${id}`).then((r) => r.data),
  getByTracking: (tracking: string) =>
    apiClient.get(`/parcels/tracking/${tracking}`).then((r) => r.data),
  create: (data: CreateParcelInput) =>
    apiClient.post('/parcels', data).then((r) => r.data),
  update: (id: string, data: UpdateParcelInput) =>
    apiClient.patch(`/parcels/${id}`, data).then((r) => r.data),
  updateStatus: (id: string, status: string) =>
    apiClient.patch(`/parcels/${id}/status`, { status }).then((r) => r.data),
  history: (id: string) =>
    apiClient.get(`/parcels/${id}/history`).then((r) => r.data),
  // Images
  listImages: (id: string): Promise<{ success: boolean; data: ParcelImage[] }> =>
    apiClient.get(`/parcels/${id}/images`).then((r) => r.data),
  addImage: (id: string, payload: { url: string; caption?: string; isPrimary?: boolean }) =>
    apiClient.post(`/parcels/${id}/images`, payload).then((r) => r.data),
  removeImage: (id: string, imageId: string) =>
    apiClient.delete(`/parcels/${id}/images/${imageId}`).then((r) => r.data),
};
