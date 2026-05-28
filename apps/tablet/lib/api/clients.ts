import { apiClient } from './client';
import type { CreateClientInput, UpdateClientInput, PaginationInput } from '@transitsoftservices/shared';

export interface PartnerPricing {
  id: string;
  clientId: string;
  transitRouteId: string | null;
  pricePerKg: number | string;
  pricePerVolume: number | string;
  isActive: boolean;
  createdAt: string;
  transitRoute?: { id: string; name: string; type: string } | null;
}

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

  // Tarification partenaire
  listPricings: (clientId: string): Promise<{ success: boolean; data: PartnerPricing[] }> =>
    apiClient.get(`/clients/${clientId}/pricings`).then((r) => r.data),
  createPricing: (
    clientId: string,
    data: { transitRouteId?: string | null; pricePerKg: number; pricePerVolume?: number; isActive?: boolean },
  ) => apiClient.post(`/clients/${clientId}/pricings`, data).then((r) => r.data),
  updatePricing: (id: string, data: Partial<{ pricePerKg: number; pricePerVolume: number; isActive: boolean }>) =>
    apiClient.patch(`/clients/pricings/${id}`, data).then((r) => r.data),
  deletePricing: (id: string) =>
    apiClient.delete(`/clients/pricings/${id}`).then((r) => r.data),
};
