'use client';

import { useForm, Controller } from 'react-hook-form';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { searchers } from '@/lib/api/searchers';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface Props { open: boolean; onClose: () => void; }

export function ExpenseFormDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/expenses', data).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Depense enregistree'); onClose(); },
    onError: () => toast.error('Erreur'),
  });

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<{ agencyId: string; title: string; reason: string; description?: string; category?: string; amount: number }>();
  const onSubmit = (data: any) => { mutation.mutate({ ...data, amount: Number(data.amount) }); reset(); };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouvelle depense"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" form="expense-form" loading={mutation.isPending}>Enregistrer</AppButton>
        </>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <AppInput label="Titre" {...register('title', { required: true })} />
        <AppInput label="Motif" {...register('reason', { required: true })} />
        <AppTextarea
          label="Description"
          rows={3}
          placeholder="Detail de la depense (optionnel)"
          {...register('description')}
        />
        <AppInput label="Categorie" {...register('category')} placeholder="Transport, fournitures..." />
        <Controller
          name="agencyId"
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <AppSearchSelect
              label="Agence"
              value={field.value}
              onChange={(v) => field.onChange(v ?? '')}
              search={(q, l) => searchers.agencies(q, l)}
              error={errors.agencyId ? 'Agence requise' : undefined}
              required
              placeholder="Selectionner une agence"
            />
          )}
        />
        <AppInput label="Montant" type="number" step="0.01" {...register('amount', { required: true })} />
      </form>
    </AppDialog>
  );
}
