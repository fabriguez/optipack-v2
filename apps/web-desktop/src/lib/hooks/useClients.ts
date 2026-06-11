import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsApi } from '@/lib/api/clients';
import type { CreateClientInput, UpdateClientInput, PaginationInput } from '@transitsoftservices/shared';
import { toast } from 'sonner';
import { extractApiError } from '@/lib/api/errorMessage';

export function useClients(params?: Partial<PaginationInput> & { agencyId?: string }) {
  return useQuery({
    queryKey: ['clients', params],
    queryFn: () => clientsApi.list(params),
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ['clients', id],
    queryFn: () => clientsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateClientInput) => clientsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client cree avec succes');
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors de la creation')),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateClientInput }) => clientsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client mis a jour');
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors de la mise a jour')),
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client supprime');
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Echec de la suppression'),
  });
}
