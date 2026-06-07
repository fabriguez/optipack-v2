import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { warehousesApi } from '@/lib/api/warehouses';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import type { PaginationInput } from '@transitsoftservices/shared';

export const useWarehouses = (params?: Partial<PaginationInput> & { agencyId?: string }) =>
  useQuery({ queryKey: ['warehouses', params], queryFn: () => warehousesApi.list(params) });

export const useWarehouse = (id: string) =>
  useQuery({ queryKey: ['warehouses', id], queryFn: () => warehousesApi.getById(id), enabled: !!id });

export const useWarehouseSummary = (id: string) =>
  useQuery({ queryKey: ['warehouses', id, 'summary'], queryFn: () => warehousesApi.summary(id), enabled: !!id });

export const useWarehouseParcels = (id: string) =>
  useQuery({ queryKey: ['parcels', 'warehouse', id], queryFn: () => warehousesApi.parcels(id), enabled: !!id });

export const useWarehouseInventories = (id: string) =>
  useQuery({ queryKey: ['warehouses', id, 'inventories'], queryFn: () => warehousesApi.inventories(id), enabled: !!id });

export const useWarehouseStorageRules = (id: string) =>
  useQuery({ queryKey: ['warehouses', id, 'storage-rules'], queryFn: () => warehousesApi.storageRules(id), enabled: !!id });

export function useDeleteWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => warehousesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['warehouses'] }); toast.success('Magasin desactive'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
}

export const useInventory = (inventoryId: string) =>
  useQuery({ queryKey: ['inventory', inventoryId], queryFn: () => warehousesApi.inventory(inventoryId), enabled: !!inventoryId });

export const useInventoryUninventoried = (inventoryId: string) =>
  useQuery({ queryKey: ['inventory', inventoryId, 'uninventoried'], queryFn: () => warehousesApi.inventoryUninventoried(inventoryId), enabled: !!inventoryId });

export function useInventoryActions(inventoryId: string, warehouseId?: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['inventory', inventoryId] });
    if (warehouseId) qc.invalidateQueries({ queryKey: ['warehouses', warehouseId, 'inventories'] });
  };
  const scan = useMutation({
    mutationFn: (data: { trackingNumber: string; observation?: string }) => warehousesApi.scanInventory(inventoryId, data),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(extractApiError(e, 'Colis introuvable')),
  });
  const mark = useMutation({
    mutationFn: (data: { parcelId: string; present: boolean; observation?: string }) => warehousesApi.markInventory(inventoryId, data),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  const close = useMutation({
    mutationFn: () => warehousesApi.closeInventory(inventoryId),
    onSuccess: () => { invalidate(); toast.success('Inventaire cloture'); },
    onError: (e) => toast.error(extractApiError(e, 'Cloture impossible')),
  });
  return { scan, mark, close };
}

export function useStartInventory(warehouseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => warehousesApi.startInventory(warehouseId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['warehouses', warehouseId, 'inventories'] }); toast.success('Inventaire lance'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
}

export function useStorageRuleMutations(warehouseId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['warehouses', warehouseId, 'storage-rules'] });
  const create = useMutation({
    mutationFn: (data: unknown) => warehousesApi.createStorageRule(warehouseId, data),
    onSuccess: () => { invalidate(); toast.success('Regle ajoutee'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => warehousesApi.updateStorageRule(id, data),
    onSuccess: () => { invalidate(); toast.success('Regle mise a jour'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => warehousesApi.deleteStorageRule(id),
    onSuccess: () => { invalidate(); toast.success('Regle supprimee'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  return { create, update, remove };
}
