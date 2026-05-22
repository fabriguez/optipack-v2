import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { containersApi } from '@/lib/api/containers';
import type { CreateContainerInput, PaginationInput } from '@transitsoftservices/shared';
import { toast } from 'sonner';
import { extractApiError } from '@/lib/api/errorMessage';

export function useContainers(params?: Partial<PaginationInput> & { status?: string }) {
  return useQuery({
    queryKey: ['containers', params],
    queryFn: () => containersApi.list(params),
  });
}

export function useContainer(id: string) {
  return useQuery({
    queryKey: ['containers', id],
    queryFn: () => containersApi.getById(id),
    enabled: !!id,
  });
}

export function useContainerParcels(id: string) {
  return useQuery({
    queryKey: ['containers', id, 'parcels'],
    queryFn: () => containersApi.getParcels(id),
    enabled: !!id,
  });
}

export function useCreateContainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateContainerInput) => containersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['containers'] });
      toast.success('Conteneur cree');
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors de la creation')),
  });
}

export function useLoadParcels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, parcelIds }: { id: string; parcelIds: string[] }) =>
      containersApi.loadParcels(id, parcelIds),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['containers'] });
      qc.invalidateQueries({ queryKey: ['parcels'] });
      toast.success(`${data.data.loaded} colis charges`);
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors du chargement')),
  });
}

export function useDepartContainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => containersApi.depart(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['containers'] });
      qc.invalidateQueries({ queryKey: ['parcels'] });
      toast.success('Conteneur en transit');
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors du depart')),
  });
}

export function useArriveContainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => containersApi.arrive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['containers'] });
      qc.invalidateQueries({ queryKey: ['parcels'] });
      toast.success('Conteneur arrive');
    },
    onError: (e) => toast.error(extractApiError(e, "Erreur lors de l'arrivee")),
  });
}
