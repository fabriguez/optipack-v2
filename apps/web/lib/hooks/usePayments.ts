import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentsApi } from '@/lib/api/payments';
import type { RecordPaymentInput, PaginationInput } from '@transitsoftservices/shared';
import { toast } from 'sonner';

export function usePayments(params?: Partial<PaginationInput> & { agencyId?: string }) {
  return useQuery({
    queryKey: ['payments', params],
    queryFn: () => paymentsApi.list(params),
  });
}

export function usePaymentsByInvoice(invoiceId: string) {
  return useQuery({
    queryKey: ['payments', 'invoice', invoiceId],
    queryFn: () => paymentsApi.getByInvoice(invoiceId),
    enabled: !!invoiceId,
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordPaymentInput) => paymentsApi.record(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['cash-register'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Paiement enregistre');
    },
    onError: () => toast.error("Erreur lors de l'enregistrement du paiement"),
  });
}

export function useVoidPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => paymentsApi.void(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['cash-register'] });
      toast.success('Paiement annule');
    },
    onError: () => toast.error("Erreur lors de l'annulation"),
  });
}
