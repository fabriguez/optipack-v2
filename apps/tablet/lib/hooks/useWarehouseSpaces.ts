import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { warehouseSpacesApi, type SpaceUpsertItem } from '@/lib/api/warehouseSpaces';

const qk = {
  list: (warehouseId: string) => ['warehouses', warehouseId, 'spaces'] as const,
};

export function useWarehouseSpaces(warehouseId: string | undefined) {
  return useQuery({
    queryKey: warehouseId ? qk.list(warehouseId) : ['warehouses', 'spaces', 'none'],
    queryFn: () => warehouseSpacesApi.list(warehouseId!),
    enabled: !!warehouseId,
  });
}

export function useUpsertWarehouseSpaces(warehouseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (spaces: SpaceUpsertItem[]) =>
      warehouseSpacesApi.upsert(warehouseId, spaces),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.list(warehouseId) });
      toast.success('Zones enregistrees');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });
}

export function useMoveParcelToSpace(warehouseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ parcelId, spaceId, comment }: { parcelId: string; spaceId: string | null; comment?: string }) =>
      warehouseSpacesApi.moveParcel(parcelId, spaceId, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.list(warehouseId) });
      // Recharge la liste des colis du magasin (la zone affichee change).
      queryClient.invalidateQueries({ queryKey: ['parcels'] });
      toast.success('Colis deplace');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });
}
