'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createDisbursementSchema, type CreateDisbursementInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { searchers } from '@/lib/api/searchers';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { disbursementsApi } from '@/lib/api/finance';
import { toast } from 'sonner';

interface Props { open: boolean; onClose: () => void; }

export function DisbursementFormDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: CreateDisbursementInput) => disbursementsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['disbursements'] }); qc.invalidateQueries({ queryKey: ['cash-register'] }); toast.success('Decaissement cree'); onClose(); },
    onError: () => toast.error('Erreur (solde insuffisant ?)'),
  });

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<CreateDisbursementInput>({
    resolver: zodResolver(createDisbursementSchema),
  });

  const onSubmit = (data: CreateDisbursementInput) => { mutation.mutate(data); reset(); };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouveau bon de decaissement"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" form="disbursement-form" loading={mutation.isPending}>Creer</AppButton>
        </>
      }
    >
      <form id="disbursement-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Controller
          name="agencyId"
          control={control}
          render={({ field }) => (
            <AppSearchSelect
              label="Agence"
              value={field.value}
              onChange={(v) => field.onChange(v ?? '')}
              search={(q, l) => searchers.agencies(q, l)}
              error={errors.agencyId?.message}
              required
              placeholder="Selectionner une agence"
            />
          )}
        />
        <AppInput label="Motif" {...register('reason')} error={errors.reason?.message} />
        <AppTextarea
          label="Description"
          rows={3}
          placeholder="Detail du decaissement (optionnel)"
          {...register('description')}
        />
        <AppInput label="Ordonnateur" {...register('orderer')} error={errors.orderer?.message} />
        <AppInput label="Montant" type="number" step="0.01" {...register('amount', { valueAsNumber: true })} error={errors.amount?.message} />
        <AppInput label="Montant en lettres" {...register('amountInWords')} error={errors.amountInWords?.message} />
      </form>
    </AppDialog>
  );
}
