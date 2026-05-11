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

interface Props {
  open: boolean;
  onClose: () => void;
  invoiceId?: string;
  /**
   * Tracking number du colis a l'origine du paiement (cas "Enregistrer
   * paiement" depuis la page detail colis). Affiche un bandeau de contexte
   * pour confirmer a l'utilisateur que le paiement concerne bien ce colis.
   */
  parcelTracking?: string;
}

export function PaymentFormDialog({ open, onClose, invoiceId, parcelTracking }: Props) {
  const mutation = useRecordPayment();

  // Charger les factures non soldees (quand pas d'invoice pre-fixee).
  const { data: invoicesData } = useQuery({
    queryKey: ['invoices-unpaid'],
    queryFn: () => apiClient.get('/invoices', { params: { limit: 100 } }).then((r) => r.data),
    enabled: open && !invoiceId,
  });

  // Charge la facture pre-fixee pour afficher un libelle clair (reference +
  // client + solde) plutot que l'UUID brut.
  const { data: pinnedInvoiceData } = useQuery({
    queryKey: ['invoice-for-payment', invoiceId],
    queryFn: () => apiClient.get(`/invoices/${invoiceId}`).then((r) => r.data),
    enabled: open && !!invoiceId,
  });
  const pinnedInvoice = pinnedInvoiceData?.data;
  const pinnedLabel = pinnedInvoice
    ? `${pinnedInvoice.reference} - ${pinnedInvoice.client?.fullName || ''} (solde ${Number(pinnedInvoice.balance).toLocaleString()} XAF)`
    : invoiceId || '';

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: { invoiceId: invoiceId || '' },
  });

  const onSubmit = (data: RecordPaymentInput) => {
    // Force invoiceId au pinned : meme si le hidden input est altere, on
    // garantit que le paiement va sur la bonne facture.
    mutation.mutate({ ...data, invoiceId: invoiceId || data.invoiceId });
    reset();
    onClose();
  };

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
        {parcelTracking && (
          <div className="rounded-xl border border-primary-100 bg-primary-50/50 px-3 py-2 text-xs text-primary-900">
            Paiement enregistre pour le colis <span className="font-mono font-bold">{parcelTracking}</span>.
          </div>
        )}
        {invoiceId ? (
          // Champ grise affichant le libelle convivial ; on garde un input
          // cache pour que React Hook Form transmette bien l'invoiceId.
          <>
            <AppInput label="Facture" value={pinnedLabel} disabled readOnly />
            <input type="hidden" {...register('invoiceId')} value={invoiceId} />
          </>
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
              search={searchers.agencies}
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
