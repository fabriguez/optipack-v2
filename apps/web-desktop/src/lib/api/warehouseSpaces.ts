import { apiClient } from './client';

export interface WarehouseSpaceDTO {
  id: string;
  warehouseId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  parcelCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SpaceUpsertItem {
  id?: string;
  name: string;
  description?: string;
  isActive?: boolean;
}

export const warehouseSpacesApi = {
  list: (warehouseId: string) =>
    apiClient.get(`/warehouses/${warehouseId}/spaces`).then((r) => r.data),
  upsert: (warehouseId: string, spaces: SpaceUpsertItem[]) =>
    apiClient.put(`/warehouses/${warehouseId}/spaces`, { spaces }).then((r) => r.data),
  moveParcel: (parcelId: string, spaceId: string | null, comment?: string) =>
    apiClient
      .post(`/warehouses/parcels/${parcelId}/space`, { spaceId, comment })
      .then((r) => r.data),
};
