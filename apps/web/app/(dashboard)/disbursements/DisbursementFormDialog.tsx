'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createDisbursementSchema, type CreateDisbursementInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { useAgencies } from '@/lib/hooks/useAgencies';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { disbursementsApi } from '@/lib/api/finance';
import { toast } from 'sonner';

interface Props { open: boolean; onClose: () => void; }

export function DisbursementFormDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const { data: agencies } = useAgencies({ limit: 100 });
  const mutation = useMutation({
    mutationFn: (data: CreateDisbursementInput) => disbursementsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['disbursements'] }); qc.invalidateQueries({ queryKey: ['cash-register'] }); toast.success('Decaissement cree'); onClose(); },
    onError: () => toast.error('Erreur (solde insuffisant ?)'),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateDisbursementInput>({
    resolver: zodResolver(createDisbursementSchema),
  });

  const onSubmit = (data: CreateDisbursementInput) => { mutation.mutate(data); reset(); };

  return (
    <AppDialog open={open} onClose={onClose} title="Nouveau bon de decaissement" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <AppSelect label="Agence" {...register('agencyId')} error={errors.agencyId?.message}
          options={(agencies?.data || []).map((a: any) => ({ value: a.id, label: a.name }))} placeholder="Selectionner" />
        <AppInput label="Motif" {...register('reason')} error={errors.reason?.message} />
        <AppTextarea label="Description" {...register('description')} />
        <AppInput label="Ordonnateur" {...register('orderer')} error={errors.orderer?.message} />
        <AppInput label="Montant" type="number" step="0.01" {...register('amount', { valueAsNumber: true })} error={errors.amount?.message} />
        <AppInput label="Montant en lettres" {...register('amountInWords')} error={errors.amountInWords?.message} />
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" loading={mutation.isPending}>Creer</AppButton>
        </div>
      </form>
    </AppDialog>
  );
}
