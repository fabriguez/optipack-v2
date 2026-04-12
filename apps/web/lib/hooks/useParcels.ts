import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parcelsApi } from '@/lib/api/parcels';
import type { CreateParcelInput, PaginationInput } from '@optipack/shared';
import { toast } from 'sonner';

export function useParcels(params?: Partial<PaginationInput> & { status?: string; clientId?: string }) {
  return useQuery({
    queryKey: ['parcels', params],
    queryFn: () => parcelsApi.list(params),
  });
}

export function useParcel(id: string) {
  return useQuery({
    queryKey: ['parcels', id],
    queryFn: () => parcelsApi.getById(id),
    enabled: !!id,
  });
}

export function useParcelByTracking(tracking: string) {
  return useQuery({
    queryKey: ['parcels', 'tracking', tracking],
    queryFn: () => parcelsApi.getByTracking(tracking),
    enabled: !!tracking,
  });
}

export function useCreateParcel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateParcelInput) => parcelsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parcels'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Colis enregistre avec succes');
    },
    onError: () => toast.error("Erreur lors de l'enregistrement"),
  });
}

export function useUpdateParcelStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => parcelsApi.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parcels'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Statut mis a jour');
    },
    onError: () => toast.error('Erreur lors du changement de statut'),
  });
}
