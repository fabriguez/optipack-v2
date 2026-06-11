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

  uploadImage: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return apiClient
      .post(`/agencies/${id}/image`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
  deleteImage: (id: string) =>
    apiClient.delete(`/agencies/${id}/image`).then((r) => r.data),
};
