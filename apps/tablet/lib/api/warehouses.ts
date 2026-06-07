import { apiClient } from './client';
import type { PaginationInput } from '@transitsoftservices/shared';

/** Endpoints magasins (mirror web /warehouses). */
export const warehousesApi = {
  list: (params?: Partial<PaginationInput> & { agencyId?: string }) =>
    apiClient.get('/warehouses', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get(`/warehouses/${id}`).then((r) => r.data),
  create: (data: unknown) =>
    apiClient.post('/warehouses', data).then((r) => r.data),
  update: (id: string, data: unknown) =>
    apiClient.patch(`/warehouses/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    apiClient.delete(`/warehouses/${id}`).then((r) => r.data),

  summary: (id: string) =>
    apiClient.get(`/warehouses/${id}/summary`).then((r) => r.data),

  // Inventaires
  inventories: (id: string) =>
    apiClient.get(`/warehouses/${id}/inventories`).then((r) => r.data),
  startInventory: (id: string) =>
    apiClient.post(`/warehouses/${id}/inventories`, {}).then((r) => r.data),
  inventory: (inventoryId: string) =>
    apiClient.get(`/warehouses/inventories/${inventoryId}`).then((r) => r.data),
  inventoryUninventoried: (inventoryId: string) =>
    apiClient.get(`/warehouses/inventories/${inventoryId}/uninventoried`).then((r) => r.data),
  scanInventory: (inventoryId: string, data: { trackingNumber: string; observation?: string }) =>
    apiClient.post(`/warehouses/inventories/${inventoryId}/scan`, data).then((r) => r.data),
  markInventory: (inventoryId: string, data: { parcelId: string; present: boolean; observation?: string }) =>
    apiClient.post(`/warehouses/inventories/${inventoryId}/mark`, data).then((r) => r.data),
  closeInventory: (inventoryId: string) =>
    apiClient.post(`/warehouses/inventories/${inventoryId}/close`, {}).then((r) => r.data),

  // Regles de magasinage
  storageRules: (id: string) =>
    apiClient.get(`/warehouses/${id}/storage-rules`).then((r) => r.data),
  createStorageRule: (id: string, data: unknown) =>
    apiClient.post(`/warehouses/${id}/storage-rules`, data).then((r) => r.data),
  updateStorageRule: (ruleId: string, data: unknown) =>
    apiClient.patch(`/warehouses/storage-rules/${ruleId}`, data).then((r) => r.data),
  deleteStorageRule: (ruleId: string) =>
    apiClient.delete(`/warehouses/storage-rules/${ruleId}`).then((r) => r.data),

  // Colis du magasin
  parcels: (id: string, params?: Record<string, unknown>) =>
    apiClient.get('/parcels', { params: { warehouseId: id, onlyPresent: 'true', limit: 20, ...params } }).then((r) => r.data),
};
