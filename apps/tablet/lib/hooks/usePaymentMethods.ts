import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';

export interface PaymentMethodItem {
  id: string;
  code: string;
  label: string;
  color?: string | null;
  icon?: string | null;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface MutationInput {
  code?: string;
  label: string;
  color?: string;
  icon?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export function usePaymentMethods() {
  return useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => apiClient.get('/payment-methods').then((r) => r.data),
  });
}

export function useCreatePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MutationInput) => apiClient.post('/payment-methods', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-methods'], refetchType: 'all' });
      toast.success('Methode de paiement creee');
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur creation methode')),
  });
}

export function useUpdatePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MutationInput }) =>
      apiClient.patch(`/payment-methods/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-methods'], refetchType: 'all' });
      toast.success('Methode mise a jour');
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur mise a jour')),
  });
}

export function useDeletePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/payment-methods/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-methods'], refetchType: 'all' });
      toast.success('Methode supprimee');
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur suppression methode')),
  });
}
