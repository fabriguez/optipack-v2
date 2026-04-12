import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsApi } from '@/lib/api/clients';
import type { CreateClientInput, UpdateClientInput, PaginationInput } from '@optipack/shared';
import { toast } from 'sonner';

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
    onError: () => toast.error('Erreur lors de la creation'),
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
    onError: () => toast.error('Erreur lors de la mise a jour'),
  });
}
