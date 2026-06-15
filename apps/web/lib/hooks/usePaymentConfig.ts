import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paymentConfigApi, type PaymentProvidersConfig } from '@/lib/api/organization';
import { toast } from 'sonner';

export function usePaymentConfig() {
  return useQuery({
    queryKey: ['payment-providers-config'],
    queryFn: () => paymentConfigApi.get().then((r) => r.data),
  });
}

export function useSavePaymentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: PaymentProvidersConfig) => paymentConfigApi.save(config),
    onSuccess: () => {
      toast.success('Configuration enregistree');
      qc.invalidateQueries({ queryKey: ['payment-providers-config'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Erreur sauvegarde');
    },
  });
}
