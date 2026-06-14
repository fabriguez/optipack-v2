'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  type CreateWarehouseInput,
  type UpdateWarehouseInput,
} from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { searchers, toSearchOption } from '@/lib/api/searchers';
import { useAgency } from '@/lib/hooks/useAgencies';
import { toast } from 'sonner';

interface WarehouseLike {
  id: string;
  name: string;
  location: string;
  agency?: { id: string; name: string; city?: string | null } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-selection (lock) de l'agence — utilise depuis la page detail agence */
  defaultAgency?: { id: string; name: string; city?: string | null } | null;
  /** Verrouille la creation sur l'agence de l'employe (non-admin mono-agence) */
  defaultAgencyId?: string;
  /** Si fourni : mode edition. agencyId est verrouille (non modifiable apres
      creation pour preserver l'integrite des stats par agence). */
  warehouse?: WarehouseLike | null;
}

export function WarehouseFormDialog({ open, onClose, defaultAgency, defaultAgencyId, warehouse }: Props) {
  // Resout l'objet agence depuis l'ID quand seul l'ID est fourni (employe mono-agence).
  const { data: resolvedAgencyResp } = useAgency(defaultAgencyId ?? '');
  const resolvedAgency = defaultAgency ?? (resolvedAgencyResp as any)?.data ?? null;
  const isEdit = !!warehouse;
  const qc = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: CreateWarehouseInput) => apiClient.post('/warehouses', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Magasin cree');
      onClose();
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message || 'Erreur lors de la creation'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateWarehouseInput) =>
      apiClient.patch(`/warehouses/${warehouse!.id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      qc.invalidateQueries({ queryKey: ['warehouses', warehouse?.id] });
      toast.success('Magasin mis a jour');
      onClose();
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message || 'Erreur lors de la mise a jour'),
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateWarehouseInput>({
    resolver: zodResolver(isEdit ? (updateWarehouseSchema as any) : createWarehouseSchema),
  });

  useEffect(() => {
    if (!open) return;
    if (warehouse) {
      reset({
        name: warehouse.name,
        agencyId: warehouse.agency?.id ?? '',
        location: warehouse.location,
      } as CreateWarehouseInput);
    } else {
      reset(resolvedAgency ? ({ agencyId: resolvedAgency.id } as CreateWarehouseInput) : ({} as CreateWarehouseInput));
    }
  }, [open, resolvedAgency, warehouse, reset]);

  const onSubmit = (data: CreateWarehouseInput) => {
    if (isEdit) {
      const { agencyId: _drop, ...rest } = data;
      updateMutation.mutate(rest as UpdateWarehouseInput);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier le magasin' : 'Nouveau magasin'}
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton
            type="submit"
            form="warehouse-form"
            loading={createMutation.isPending || updateMutation.isPending}
          >
            {isEdit ? 'Enregistrer' : 'Creer'}
          </AppButton>
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
              search={searchers.agencies}
              selectedOption={
                resolvedAgency
                  ? toSearchOption.agency(resolvedAgency)
                  : warehouse?.agency
                    ? toSearchOption.agency(warehouse.agency)
                    : undefined
              }
              error={errors.agencyId?.message}
              required
              disabled={!!resolvedAgency || isEdit}
              placeholder="Selectionner une agence"
            />
          )}
        />

        <AppInput label="Emplacement" {...register('location')} error={errors.location?.message} />

        <p className="rounded-xl bg-primary-50 px-3 py-2 text-xs text-primary-800">
          Les frais de magasinage se configurent apres creation, depuis l&apos;onglet
          &quot;Frais magasinage&quot; du magasin (par type de transit / route / intervalle masse-volume).
        </p>
      </form>
    </AppDialog>
  );
}
