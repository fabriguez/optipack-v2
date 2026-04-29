'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createWarehouseSchema, type CreateWarehouseInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { searchers } from '@/lib/api/searchers';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-selection (lock) de l'agence — utilise depuis la page detail agence */
  defaultAgency?: { id: string; name: string; city?: string | null } | null;
}

export function WarehouseFormDialog({ open, onClose, defaultAgency }: Props) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: CreateWarehouseInput) => apiClient.post('/warehouses', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Magasin cree');
      onClose();
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message || 'Erreur lors de la creation'),
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateWarehouseInput>({
    resolver: zodResolver(createWarehouseSchema),
  });

  useEffect(() => {
    if (open) {
      reset(defaultAgency ? ({ agencyId: defaultAgency.id } as CreateWarehouseInput) : ({} as CreateWarehouseInput));
    }
  }, [open, defaultAgency, reset]);

  const onSubmit = (data: CreateWarehouseInput) => {
    mutation.mutate(data);
    reset();
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouveau magasin"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" form="warehouse-form" loading={mutation.isPending}>Creer</AppButton>
        </>
      }
    >
      <form id="warehouse-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <AppInput label="Nom" {...register('name')} error={errors.name?.message} />

        <Controller
          control={control}
          name="agencyId"
          render={({ field }) => (
            <AppSearchSelect
              label="Agence"
              value={field.value}
              onChange={(v) => field.onChange(v ?? '')}
              search={(q, l) => searchers.agencies(q, l)}
              selectedOption={
                defaultAgency
                  ? { value: defaultAgency.id, label: defaultAgency.name, sublabel: defaultAgency.city ?? null }
                  : undefined
              }
              error={errors.agencyId?.message}
              required
              disabled={!!defaultAgency}
              placeholder="Selectionner une agence"
            />
          )}
        />

        <AppInput label="Emplacement" {...register('location')} error={errors.location?.message} />
      </form>
    </AppDialog>
  );
}
