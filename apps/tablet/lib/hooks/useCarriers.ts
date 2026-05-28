import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { PaginationInput } from '@transitsoftservices/shared';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';

export interface CarrierItem {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  carrierType?: string | null;
  notes?: string | null;
  clientId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; fullName: string; phone: string } | null;
}

export function useCarriers(params?: Partial<PaginationInput>) {
  return useQuery({
    queryKey: ['carriers', params],
    queryFn: () => apiClient.get('/carriers', { params }).then((r) => r.data),
  });
}

export function useCarrier(id: string) {
  return useQuery({
    queryKey: ['carriers', id],
    queryFn: () => apiClient.get(`/carriers/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useDeleteCarrier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/carriers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['carriers'] });
      toast.success('Transporteur desactive');
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors de la suppression')),
  });
}
