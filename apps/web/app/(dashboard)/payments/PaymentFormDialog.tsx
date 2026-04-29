'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { recordPaymentSchema, type RecordPaymentInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { searchers } from '@/lib/api/searchers';
import { useRecordPayment } from '@/lib/hooks/usePayments';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface Props { open: boolean; onClose: () => void; invoiceId?: string; }

export function PaymentFormDialog({ open, onClose, invoiceId }: Props) {
  const mutation = useRecordPayment();

  // Charger les factures non soldees
  const { data: invoicesData } = useQuery({
    queryKey: ['invoices-unpaid'],
    queryFn: () => apiClient.get('/invoices', { params: { limit: 100 } }).then((r) => r.data),
    enabled: open && !invoiceId,
  });

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<RecordPaymentInput>({
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
    <AppDialog
      open={open}
      onClose={onClose}
      title="Enregistrer un paiement"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" form="payment-form" loading={mutation.isPending}>Enregistrer</AppButton>
        </>
      }
    >
      <form id="payment-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
        <Controller
          name="agencyId"
          control={control}
          render={({ field }) => (
            <AppSearchSelect
              label="Agence encaisseuse"
              value={field.value}
              onChange={(v) => field.onChange(v ?? '')}
              search={(q, l) => searchers.agencies(q, l)}
              error={errors.agencyId?.message}
              placeholder="Selectionner une agence"
            />
          )}
        />
        <AppInput label="Montant" type="number" step="0.01" {...register('amount', { valueAsNumber: true })} error={errors.amount?.message} />
        <AppSelect label="Mode de paiement" {...register('paymentMethod')} error={errors.paymentMethod?.message}
          options={[
            { value: 'CASH', label: 'Especes' }, { value: 'MOBILE_MONEY', label: 'Mobile Money' },
            { value: 'BANK_TRANSFER', label: 'Virement' }, { value: 'CARD', label: 'Carte' }, { value: 'CHECK', label: 'Cheque' },
          ]} placeholder="Selectionner" />
        <AppInput label="Reference transaction" {...register('transactionReference')} placeholder="Optionnel" />
      </form>
    </AppDialog>
  );
}
