'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createContainerSchema, type CreateContainerInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppSwitch } from '@/components/ui/AppSwitch';
import { useCreateContainer } from '@/lib/hooks/useContainers';
import { searchers } from '@/lib/api/searchers';

interface ContainerFormDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ContainerFormDialog({ open, onClose }: ContainerFormDialogProps) {
  const createMutation = useCreateContainer();
  const [isForwarding, setIsForwarding] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<CreateContainerInput>({
    resolver: zodResolver(createContainerSchema),
    defaultValues: { isForwarding: false },
  });

  const onSubmit = async (data: CreateContainerInput) => {
    await createMutation.mutateAsync({ ...data, isForwarding });
    reset();
    setIsForwarding(false);
    onClose();
  };

  const typeOptions = isForwarding
    ? [
        { value: 'AIR', label: 'Aerien' },
        { value: 'SEA', label: 'Maritime' },
        { value: 'LAND', label: 'Terrestre' },
      ]
    : [
        { value: 'AIR', label: 'Aerien' },
        { value: 'SEA', label: 'Maritime' },
      ];

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouveau conteneur"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton type="submit" form="container-form" loading={createMutation.isPending}>
            Creer
          </AppButton>
        </>
      }
    >
      <form id="container-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <AppInput label="Designation" {...register('designation')} error={errors.designation?.message} />

        <div className="flex items-center justify-between rounded-xl bg-primary-50 p-3">
          <div>
            <p className="text-sm font-medium text-primary-900">Conteneur d&apos;acheminement</p>
            <p className="text-xs text-primary-700">
              Accepte tous les types de colis (peu importe le mode de transit).
            </p>
          </div>
          <AppSwitch
            checked={isForwarding}
            onCheckedChange={(v) => {
              setIsForwarding(v);
              setValue('isForwarding', v);
              if (!v && watch('type') === 'LAND') setValue('type', 'AIR' as never);
            }}
          />
        </div>

        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <AppSelect
              label="Type"
              options={typeOptions}
              value={field.value}
              onValueChange={(v) => field.onChange(v)}
              error={errors.type?.message}
              placeholder="Selectionner un type"
            />
          )}
        />

        <AppInput
          label="Capacite (kg)"
          type="number"
          step="0.01"
          {...register('capacity', { valueAsNumber: true })}
          error={errors.capacity?.message}
        />

        <Controller
          control={control}
          name="departureAgencyId"
          render={({ field }) => (
            <AppSearchSelect
              label="Agence de depart"
              value={field.value}
              onChange={(v) => field.onChange(v ?? '')}
              search={(q, l) => searchers.agencies(q, l)}
              error={errors.departureAgencyId?.message}
              required
              placeholder="Selectionner"
            />
          )}
        />

        <Controller
          control={control}
          name="arrivalAgencyId"
          render={({ field }) => (
            <AppSearchSelect
              label="Agence d'arrivee"
              value={field.value}
              onChange={(v) => field.onChange(v ?? '')}
              search={(q, l) => searchers.agencies(q, l)}
              error={errors.arrivalAgencyId?.message}
              required
              placeholder="Selectionner"
            />
          )}
        />

        <Controller
          control={control}
          name="transitRouteId"
          render={({ field }) => (
            <AppSearchSelect
              label="Route de transit (optionnel)"
              value={field.value || null}
              onChange={(v) => field.onChange(v ?? undefined)}
              search={(q, l) => searchers.transitRoutes(q, l)}
              placeholder="Optionnel"
            />
          )}
        />

      </form>
    </AppDialog>
  );
}
