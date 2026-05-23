'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppTextarea } from '@/components/ui/AppTextarea';
import {
  applyInvoiceDiscountSchema,
  formatAmount,
  type ApplyInvoiceDiscountInput,
} from '@transitsoftservices/shared';
import { extractApiError } from '@/lib/api/errorMessage';

interface Props {
  open: boolean;
  onClose: () => void;
  invoice: {
    id: string;
    totalAmount: number | string;
    discount: number | string;
    paidAmount: number | string;
  } | null;
}

/**
 * Applique (ou remplace) la remise commerciale d'une facture. La justification
 * est obligatoire et tracee dans le journal d'audit cote API. Schema partage
 * (apps/api <-> apps/web) via @transitsoftservices/shared.
 */
export function InvoiceDiscountDialog({ open, onClose, invoice }: Props) {
  const qc = useQueryClient();
  const total = Number(invoice?.totalAmount ?? 0);

  const { register, handleSubmit, reset, watch, formState: { errors } } =
    useForm<ApplyInvoiceDiscountInput>({
      resolver: zodResolver(applyInvoiceDiscountSchema),
      defaultValues: { amount: 0, reason: '' },
    });

  useEffect(() => {
    if (!open) return;
    reset({ amount: Number(invoice?.discount ?? 0), reason: '' });
  }, [open, invoice, reset]);

  const mutation = useMutation({
    mutationFn: (data: ApplyInvoiceDiscountInput) =>
      apiClient.post(`/invoices/${invoice!.id}/discount`, data),
    onSuccess: () => {
      toast.success('Remise enregistree');
      qc.invalidateQueries({ queryKey: ['invoices', invoice!.id] });
      qc.invalidateQueries({ queryKey: ['payments', 'invoice', invoice!.id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      onClose();
    },
    onError: (e) => toast.error(extractApiError(e, "Echec de l'application de la remise")),
  });

  const onSubmit = (data: ApplyInvoiceDiscountInput) => {
    if (data.amount > total) {
      toast.error(`Remise (${formatAmount(data.amount)}) superieure au brut (${formatAmount(total)}).`);
      return;
    }
    mutation.mutate(data);
  };

  const watchedAmount = Number(watch('amount') || 0);
  const tooBig = watchedAmount > total;

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Appliquer une remise"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton
            type="submit"
            form="invoice-discount-form"
            loading={mutation.isPending}
            disabled={tooBig}
          >
            Enregistrer
          </AppButton>
        </>
      }
    >
      <form id="invoice-discount-form" onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <p className="text-xs text-gray-500">
          La remise remplace la valeur courante. La justification est tracee dans
          le journal d&apos;audit (qui, quand, pourquoi).
        </p>
        <div className="rounded-xl bg-gray-50 p-3 text-sm">
          <div className="flex justify-between">
            <span>Montant brut</span>
            <span className="font-mono">{formatAmount(total)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Remise actuelle</span>
            <span className="font-mono">{formatAmount(Number(invoice?.discount ?? 0))}</span>
          </div>
        </div>
        <AppInput
          label="Nouvelle remise"
          type="number"
          step="0.01"
          {...register('amount', { valueAsNumber: true })}
          error={errors.amount?.message}
        />
        {tooBig && (
          <p className="text-xs text-red-600">
            La remise ne peut pas exceder le brut ({formatAmount(total)}).
          </p>
        )}
        <AppTextarea
          label="Justification (obligatoire)"
          rows={3}
          placeholder="Geste commercial, erreur tarif, fidelite..."
          {...register('reason')}
          error={errors.reason?.message}
        />
      </form>
    </AppDialog>
  );
}
