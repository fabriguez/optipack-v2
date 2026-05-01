'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { searchers, toSearchOption } from '@/lib/api/searchers';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-selection (lock) de l'agence — utilise depuis la page detail agence */
  defaultAgency?: { id: string; name: string; city?: string | null } | null;
  /** Si fourni, le dialog passe en mode edition */
  employee?: { id: string; fullName: string; position: string; agencyId: string; phone?: string | null; idNumber?: string | null; baseSalary?: number | string | null } | null;
}

export function EmployeeFormDialog({ open, onClose, defaultAgency, employee }: Props) {
  const qc = useQueryClient();
  const isEdit = !!employee;
  const mutation = useMutation({
    mutationFn: (data: any) =>
      isEdit
        ? apiClient.patch(`/employees/${employee!.id}`, data).then((r) => r.data)
        : apiClient.post('/employees', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success(isEdit ? 'Employe mis a jour' : 'Employe cree');
      onClose();
    },
    onError: () => toast.error('Erreur'),
  });

  const { register, handleSubmit, reset, control } = useForm();
  const onSubmit = (data: any) => { mutation.mutate({ ...data, baseSalary: Number(data.baseSalary || 0) }); reset(); };

  useEffect(() => {
    if (open) {
      if (employee) {
        reset({
          fullName: employee.fullName,
          agencyId: employee.agencyId,
          position: employee.position,
          phone: employee.phone ?? '',
          idNumber: employee.idNumber ?? '',
          baseSalary: employee.baseSalary != null ? Number(employee.baseSalary) : undefined,
        });
      } else {
        reset(defaultAgency ? { agencyId: defaultAgency.id } : {});
      }
    }
  }, [open, defaultAgency, employee, reset]);

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Modifier l'employe" : "Nouvel employe"}
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" form="employee-form" loading={mutation.isPending}>{isEdit ? 'Enregistrer' : 'Creer'}</AppButton>
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
              search={searchers.agencies}
              selectedOption={defaultAgency ? toSearchOption.agency(defaultAgency) : undefined}
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
