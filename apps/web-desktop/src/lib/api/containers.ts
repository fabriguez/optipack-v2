import { apiClient } from './client';
import type { CreateContainerInput, PaginationInput } from '@transitsoftservices/shared';

export interface ContainerHistoryEntry {
  id: string;
  containerId: string;
  action: string;
  statusBefore: string | null;
  statusAfter: string | null;
  changes: Record<string, unknown> | null;
  comment: string | null;
  createdAt: string;
  user?: { id: string; firstName: string; lastName: string } | null;
}

export interface ManifestDiscrepancy {
  id: string;
  containerId: string;
  parcelId: string | null;
  type: 'MISSING_PHYSICAL' | 'EXTRA_PHYSICAL';
  designation: string | null;
  trackingNumber: string | null;
  weight: string | number | null;
  comment: string | null;
  markedByUserId: string | null;
  createdAt: string;
}

export const containersApi = {
  list: (params?: Partial<PaginationInput> & { status?: string }) =>
    apiClient.get('/containers', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get(`/containers/${id}`).then((r) => r.data),
  getParcels: (id: string) =>
    apiClient.get(`/containers/${id}/parcels`).then((r) => r.data),
  history: (id: string): Promise<{ success: boolean; data: ContainerHistoryEntry[] }> =>
    apiClient.get(`/containers/${id}/history`).then((r) => r.data),
  create: (data: CreateContainerInput & { isForwarding?: boolean }) =>
    apiClient.post('/containers', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/containers/${id}`, data).then((r) => r.data),
  loadParcels: (id: string, parcelIds: string[]) =>
    apiClient.post(`/containers/${id}/load`, { parcelIds }).then((r) => r.data),
  loadByQr: (id: string, trackingNumber: string) =>
    apiClient.post(`/containers/${id}/load-by-qr`, { trackingNumber }).then((r) => r.data),
  removeParcel: (id: string, parcelId: string, reason: string) =>
    apiClient.post(`/containers/${id}/remove-parcel`, { parcelId, reason }).then((r) => r.data),
  loadableParcels: (
    id: string,
    params?: { search?: string; page?: number; limit?: number },
  ) => apiClient.get(`/containers/${id}/loadable-parcels`, { params }).then((r) => r.data),
  depart: (id: string) =>
    apiClient.post(`/containers/${id}/depart`).then((r) => r.data),
  arrive: (id: string) =>
    apiClient.post(`/containers/${id}/arrive`).then((r) => r.data),
  unload: (id: string, data: { parcelId: string; action: string; warehouseId: string; newWeight?: number; comment?: string }) =>
    apiClient.post(`/containers/${id}/unload`, data).then((r) => r.data),
};

export const manifestsApi = {
  createDispatch: (containerId: string) =>
    apiClient.post(`/manifests/dispatch/${containerId}`).then((r) => r.data),
  createReception: (containerId: string) =>
    apiClient.post(`/manifests/reception/${containerId}`).then((r) => r.data),
  comparison: (containerId: string) =>
    apiClient.get(`/manifests/comparison/${containerId}`).then((r) => r.data),
  getById: (id: string) => apiClient.get(`/manifests/${id}`).then((r) => r.data),

  // Liste paginee. Utilise pour l'historique des bordereaux d'un conteneur.
  list: (params: {
    containerId?: string;
    type?: 'DISPATCH' | 'RECEPTION';
    status?: 'ACTIVE' | 'ARCHIVED' | 'CANCELLED';
    page?: number;
    limit?: number;
  }) => apiClient.get(`/manifests`, { params }).then((r) => r.data),

  // Ecarts admin
  listDiscrepancies: (containerId: string): Promise<{ success: boolean; data: ManifestDiscrepancy[] }> =>
    apiClient.get(`/manifests/discrepancies/${containerId}`).then((r) => r.data),
  addDiscrepancy: (
    containerId: string,
    data: {
      type: 'MISSING_PHYSICAL' | 'EXTRA_PHYSICAL';
      parcelId?: string;
      designation?: string;
      trackingNumber?: string;
      weight?: number;
      comment?: string;
    },
  ) => apiClient.post(`/manifests/discrepancies/${containerId}`, data).then((r) => r.data),
  removeDiscrepancy: (containerId: string, discrepancyId: string) =>
    apiClient.delete(`/manifests/discrepancies/${containerId}/${discrepancyId}`).then((r) => r.data),
};
