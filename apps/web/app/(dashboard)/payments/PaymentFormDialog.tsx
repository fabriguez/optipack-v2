'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { recordPaymentSchema, type RecordPaymentInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { useAgencies } from '@/lib/hooks/useAgencies';
import { useRecordPayment } from '@/lib/hooks/usePayments';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface Props { open: boolean; onClose: () => void; invoiceId?: string; }

export function PaymentFormDialog({ open, onClose, invoiceId }: Props) {
  const { data: agencies } = useAgencies({ limit: 100 });
  const mutation = useRecordPayment();

  // Charger les factures non soldees
  const { data: invoicesData } = useQuery({
    queryKey: ['invoices-unpaid'],
    queryFn: () => apiClient.get('/invoices', { params: { limit: 100 } }).then((r) => r.data),
    enabled: open && !invoiceId,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: { invoiceId: invoiceId || '' },
  });

  const onSubmit = (data: RecordPaymentInput) => { mutation.mutate(data); reset(); onClose(); };

  const invoiceOptions = (invoicesData?.data || [])
    .filter((inv: any) => inv.status !== 'PAID')
    .map((inv: any) => ({
      value: inv.id,
      label: `${inv.reference} - ${inv.client?.fullName || ''} (${Number(inv.balance).toLocaleString()} XAF)`,
    }));

  return (
    <AppDialog open={open} onClose={onClose} title="Enregistrer un paiement" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {invoiceId ? (
          <AppInput label="Facture" value={invoiceId} disabled {...register('invoiceId')} />
        ) : (
          <AppSelect
            label="Facture"
            {...register('invoiceId')}
            error={errors.invoiceId?.message}
            options={invoiceOptions}
            placeholder="Selectionner une facture"
          />
        )}
        <AppSelect label="Agence encaisseuse" {...register('agencyId')} error={errors.agencyId?.message}
          options={(agencies?.data || []).map((a: any) => ({ value: a.id, label: a.name }))} placeholder="Selectionner" />
        <AppInput label="Montant" type="number" step="0.01" {...register('amount', { valueAsNumber: true })} error={errors.amount?.message} />
        <AppSelect label="Mode de paiement" {...register('paymentMethod')} error={errors.paymentMethod?.message}
          options={[
            { value: 'CASH', label: 'Especes' }, { value: 'MOBILE_MONEY', label: 'Mobile Money' },
            { value: 'BANK_TRANSFER', label: 'Virement' }, { value: 'CARD', label: 'Carte' }, { value: 'CHECK', label: 'Cheque' },
          ]} placeholder="Selectionner" />
        <AppInput label="Reference transaction" {...register('transactionReference')} placeholder="Optionnel" />
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" loading={mutation.isPending}>Enregistrer</AppButton>
        </div>
      </form>
    </AppDialog>
  );
}
