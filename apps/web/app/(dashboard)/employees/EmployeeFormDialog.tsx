'use client';

import { useForm } from 'react-hook-form';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { useAgencies } from '@/lib/hooks/useAgencies';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface Props { open: boolean; onClose: () => void; }

export function EmployeeFormDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const { data: agencies } = useAgencies({ limit: 100 });
  const mutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/employees', data).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast.success('Employe cree'); onClose(); },
    onError: () => toast.error('Erreur'),
  });

  const { register, handleSubmit, reset } = useForm();
  const onSubmit = (data: any) => { mutation.mutate({ ...data, baseSalary: Number(data.baseSalary || 0) }); reset(); };

  return (
    <AppDialog open={open} onClose={onClose} title="Nouvel employe" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <AppInput label="Nom complet" {...register('fullName', { required: true })} />
        <AppSelect label="Agence" {...register('agencyId', { required: true })}
          options={(agencies?.data || []).map((a: any) => ({ value: a.id, label: a.name }))} placeholder="Selectionner" />
        <AppInput label="Poste" {...register('position', { required: true })} />
        <AppInput label="Telephone" {...register('phone')} />
        <AppInput label="N. identite" {...register('idNumber')} />
        <AppInput label="Salaire de base" type="number" {...register('baseSalary')} />
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" loading={mutation.isPending}>Creer</AppButton>
        </div>
      </form>
    </AppDialog>
  );
}
