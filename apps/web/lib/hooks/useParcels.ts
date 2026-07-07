import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parcelsApi, type ParcelListParams } from '@/lib/api/parcels';
import type { CreateParcelInput, UpdateParcelInput } from '@transitsoftservices/shared';
import { toast } from 'sonner';
import { extractApiError } from '@/lib/api/errorMessage';

export function useParcels(params?: ParcelListParams) {
  return useQuery({
    queryKey: ['parcels', params],
    queryFn: () => parcelsApi.list(params),
  });
}

/** Valeurs de filtre presentes dans un listing de colis (selects scopes). */
export function useParcelFacets(
  params?: { warehouseId?: string; onlyPresent?: boolean; archived?: 'true' | 'all' | 'false' },
  enabled = true,
) {
  return useQuery({
    queryKey: ['parcels', 'facets', params],
    queryFn: () => parcelsApi.facets(params),
    enabled,
  });
}

export function useArchiveParcels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason?: string }) =>
      parcelsApi.archive(ids, reason),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['parcels'] });
      const data = res?.data ?? res;
      const archived = data?.archived ?? 0;
      const skipped = data?.skipped ?? 0;
      const errors = data?.errors?.length ?? 0;
      toast.success(
        `${archived} colis archive(s)` +
          (skipped > 0 ? ` (${skipped} deja archive(s))` : '') +
          (errors > 0 ? ` - ${errors} erreur(s)` : ''),
      );
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Echec de l'archivage"),
  });
}

export function useUnarchiveParcels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason?: string }) =>
      parcelsApi.unarchive(ids, reason),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['parcels'] });
      const data = res?.data ?? res;
      const archived = data?.archived ?? 0;
      toast.success(`${archived} colis desarchive(s)`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Echec du desarchivage'),
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
    onError: (e) => toast.error(extractApiError(e, "Erreur lors de l'enregistrement")),
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
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors du changement de statut')),
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
    onError: (e) => toast.error(extractApiError(e, "Erreur lors de l'ajout de l'image")),
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
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors de la suppression')),
  });
}
