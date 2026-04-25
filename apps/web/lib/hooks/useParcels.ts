import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parcelsApi } from '@/lib/api/parcels';
import type { CreateParcelInput, UpdateParcelInput, PaginationInput } from '@transitsoftservices/shared';
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

export function useUpdateParcel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateParcelInput }) => parcelsApi.update(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['parcels'] });
      qc.invalidateQueries({ queryKey: ['parcels', variables.id] });
      toast.success('Colis modifie');
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message || 'Erreur lors de la modification'),
  });
}

export function useParcelHistory(id: string) {
  return useQuery({
    queryKey: ['parcels', id, 'history'],
    queryFn: () => parcelsApi.history(id),
    enabled: !!id,
  });
}

export function useParcelImages(id: string) {
  return useQuery({
    queryKey: ['parcels', id, 'images'],
    queryFn: () => parcelsApi.listImages(id),
    enabled: !!id,
  });
}

export function useAddParcelImage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { url: string; caption?: string; isPrimary?: boolean }) =>
      parcelsApi.addImage(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parcels', id, 'images'] });
      qc.invalidateQueries({ queryKey: ['parcels', id, 'history'] });
      toast.success('Image ajoutee');
    },
    onError: () => toast.error("Erreur lors de l'ajout de l'image"),
  });
}

export function useRemoveParcelImage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (imageId: string) => parcelsApi.removeImage(id, imageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parcels', id, 'images'] });
      qc.invalidateQueries({ queryKey: ['parcels', id, 'history'] });
      toast.success('Image retiree');
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });
}
