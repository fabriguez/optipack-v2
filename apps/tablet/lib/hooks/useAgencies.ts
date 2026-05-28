import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agenciesApi } from '@/lib/api/agencies';
import type { CreateAgencyInput, UpdateAgencyInput, PaginationInput } from '@transitsoftservices/shared';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';

export function useAgencies(params?: Partial<PaginationInput>) {
  return useQuery({
    queryKey: ['agencies', params],
    queryFn: () => agenciesApi.list(params),
  });
}

export function useAgency(id: string) {
  return useQuery({
    queryKey: ['agencies', id],
    queryFn: () => agenciesApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateAgency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAgencyInput) => agenciesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agencies'] });
      toast.success('Agence creee avec succes');
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors de la creation')),
  });
}

export function useUpdateAgency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAgencyInput }) => agenciesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agencies'] });
      toast.success('Agence mise a jour');
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors de la mise a jour')),
  });
}

export function useDeleteAgency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agenciesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agencies'] });
      toast.success('Agence desactivee');
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors de la suppression')),
  });
}
