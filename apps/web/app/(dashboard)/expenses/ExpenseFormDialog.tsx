'use client';

import { useForm } from 'react-hook-form';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { useAgencies } from '@/lib/hooks/useAgencies';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface Props { open: boolean; onClose: () => void; }

export function ExpenseFormDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const { data: agencies } = useAgencies({ limit: 100 });
  const mutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/expenses', data).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Depense enregistree'); onClose(); },
    onError: () => toast.error('Erreur'),
  });

  const { register, handleSubmit, reset } = useForm();
  const onSubmit = (data: any) => { mutation.mutate({ ...data, amount: Number(data.amount) }); reset(); };

  return (
    <AppDialog open={open} onClose={onClose} title="Nouvelle depense" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <AppInput label="Titre" {...register('title', { required: true })} />
        <AppInput label="Motif" {...register('reason', { required: true })} />
        <AppTextarea label="Description" {...register('description')} />
        <AppInput label="Categorie" {...register('category')} placeholder="Transport, fournitures..." />
        <AppSelect label="Agence" {...register('agencyId', { required: true })}
          options={(agencies?.data || []).map((a: any) => ({ value: a.id, label: a.name }))} placeholder="Selectionner" />
        <AppInput label="Montant" type="number" step="0.01" {...register('amount', { required: true })} />
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" loading={mutation.isPending}>Enregistrer</AppButton>
        </div>
      </form>
    </AppDialog>
  );
}
