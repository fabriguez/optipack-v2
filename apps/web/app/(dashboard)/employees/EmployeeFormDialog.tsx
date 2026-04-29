'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { searchers } from '@/lib/api/searchers';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-selection (lock) de l'agence — utilise depuis la page detail agence */
  defaultAgency?: { id: string; name: string; city?: string | null } | null;
}

export function EmployeeFormDialog({ open, onClose, defaultAgency }: Props) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/employees', data).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast.success('Employe cree'); onClose(); },
    onError: () => toast.error('Erreur'),
  });

  const { register, handleSubmit, reset, control } = useForm();
  const onSubmit = (data: any) => { mutation.mutate({ ...data, baseSalary: Number(data.baseSalary || 0) }); reset(); };

  useEffect(() => {
    if (open) {
      reset(defaultAgency ? { agencyId: defaultAgency.id } : {});
    }
  }, [open, defaultAgency, reset]);

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouvel employe"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" form="employee-form" loading={mutation.isPending}>Creer</AppButton>
        </>
      }
    >
      <form id="employee-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <AppInput label="Nom complet" {...register('fullName', { required: true })} />
        <Controller
          name="agencyId"
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <AppSearchSelect
              label="Agence"
              value={field.value as string | null | undefined}
              onChange={(v) => field.onChange(v ?? '')}
              search={(q, l) => searchers.agencies(q, l)}
              selectedOption={
                defaultAgency
                  ? { value: defaultAgency.id, label: defaultAgency.name, sublabel: defaultAgency.city ?? null }
                  : undefined
              }
              required
              disabled={!!defaultAgency}
              placeholder="Selectionner une agence"
            />
          )}
        />
        <AppInput label="Poste" {...register('position', { required: true })} />
        <Controller
          name="phone"
          control={control}
          render={({ field }) => (
            <AppPhoneInput
              label="Telephone"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <AppInput label="N. identite" {...register('idNumber')} />
        <AppInput label="Salaire de base" type="number" {...register('baseSalary')} />
      </form>
    </AppDialog>
  );
}
