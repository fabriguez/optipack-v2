import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentsApi } from '@/lib/api/payments';
import type { RecordPaymentInput, PaginationInput } from '@transitsoftservices/shared';
import { toast } from 'sonner';
import { extractApiError } from '@/lib/api/errorMessage';

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
    onSuccess: async () => {
      // Invalide ET force refetch immediat. invalidateQueries seul ne refetch
      // que les queries actives (montees). Un dialog ouvert depuis une autre
      // page peut laisser le listing /payments inactif -> il restait
      // stale meme apres invalidation. refetchQueries garantit la mise a
      // jour des queries inactives au prochain affichage.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['payments'], refetchType: 'all' }),
        qc.invalidateQueries({ queryKey: ['cash-register'], refetchType: 'all' }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
        qc.invalidateQueries({ queryKey: ['invoices'] }),
        qc.invalidateQueries({ queryKey: ['parcels'] }),
      ]);
      toast.success('Paiement enregistre');
    },
    onError: (e) => toast.error(extractApiError(e, "Erreur lors de l'enregistrement du paiement")),
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
    onError: (e) => toast.error(extractApiError(e, "Erreur lors de l'annulation")),
  });
}
