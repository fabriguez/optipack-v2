'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { adjustDebtSchema, type AdjustDebtInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { apiClient } from '@/lib/api/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  debtId: string;
  currentTotalAmount: number;
  currentNextDueDate?: string | null;
  currentDueDateFinal?: string | null;
  onAdjusted?: () => void;
}

export function AdjustDebtDialog({
  open,
  onClose,
  debtId,
  currentTotalAmount,
  currentNextDueDate,
  currentDueDateFinal,
  onAdjusted,
}: Props) {
  const qc = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AdjustDebtInput>({
    resolver: zodResolver(adjustDebtSchema),
    defaultValues: {
      newTotalAmount: currentTotalAmount,
      newNextDueDate: currentNextDueDate
        ? new Date(currentNextDueDate).toISOString().slice(0, 10)
        : undefined,
      newDueDateFinal: currentDueDateFinal
        ? new Date(currentDueDateFinal).toISOString().slice(0, 10)
        : undefined,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        newTotalAmount: currentTotalAmount,
        newNextDueDate: currentNextDueDate
          ? new Date(currentNextDueDate).toISOString().slice(0, 10)
          : undefined,
        newDueDateFinal: currentDueDateFinal
          ? new Date(currentDueDateFinal).toISOString().slice(0, 10)
          : undefined,
      });
    }
  }, [open, currentTotalAmount, currentNextDueDate, currentDueDateFinal, reset]);

  const mutation = useMutation({
    mutationFn: (data: AdjustDebtInput) =>
      apiClient.post(`/debts/${debtId}/adjust`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debts', debtId] });
      qc.invalidateQueries({ queryKey: ['debts'] });
      toast.success('Dette ajustee');
      onAdjusted?.();
      onClose();
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || "Echec de l'ajustement");
    },
  });

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Ajuster la dette"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton type="submit" form="adjust-debt-form" loading={mutation.isPending}>
            Appliquer
          </AppButton>
        </>
      }
    >
      <form
        id="adjust-debt-form"
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="space-y-4"
      >
        <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          Le delta est trace dans l&apos;historique audit. Refus si le nouveau montant
          est inferieur au deja paye.
        </div>

        <AppInput
          label="Nouveau montant total"
          type="number"
          step="0.01"
          {...register('newTotalAmount', { valueAsNumber: true })}
          error={errors.newTotalAmount?.message}
        />

        <AppInput
          label="Nouvelle prochaine echeance (optionnel)"
          type="date"
          {...register('newNextDueDate')}
        />

        <AppInput
          label="Nouvelle echeance finale (optionnel)"
          type="date"
          {...register('newDueDateFinal')}
        />

        <AppTextarea
          label="Motif (requis, min 5 caracteres)"
          rows={3}
          {...register('reason')}
          error={errors.reason?.message}
          placeholder="Ex: accord commercial, erreur de saisie initiale..."
        />
      </form>
    </AppDialog>
  );
}
