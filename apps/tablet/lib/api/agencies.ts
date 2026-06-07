import { apiClient } from './client';
import type { CreateAgencyInput, UpdateAgencyInput, PaginationInput } from '@transitsoftservices/shared';

export const agenciesApi = {
  list: (params?: Partial<PaginationInput>) =>
    apiClient.get('/agencies', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get(`/agencies/${id}`).then((r) => r.data),
  create: (data: CreateAgencyInput) =>
    apiClient.post('/agencies', data).then((r) => r.data),
  update: (id: string, data: UpdateAgencyInput) =>
    apiClient.patch(`/agencies/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    apiClient.delete(`/agencies/${id}`).then((r) => r.data),

  uploadImage: (id: string, file: File | { uri: string; name: string; mimeType: string }) => {
    const fd = new FormData();
    if (typeof File !== 'undefined' && file instanceof File) {
      fd.append('image', file);
    } else {
      const asset = file as { uri: string; name: string; mimeType: string };
      // React Native : FormData accepte un objet { uri, name, type }.
      fd.append('image', { uri: asset.uri, name: asset.name, type: asset.mimeType } as never);
    }
    return apiClient
      .post(`/agencies/${id}/image`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
  deleteImage: (id: string) =>
    apiClient.delete(`/agencies/${id}/image`).then((r) => r.data),
};
