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
    // si on coupe le mode acheminement, on retire le parent
    const payload: CreateContainerInput = {
      ...data,
      isForwarding,
      ...(isForwarding ? {} : { parentContainerId: undefined }),
    };
    await createMutation.mutateAsync(payload);
    reset();
    setIsForwarding(false);
    onClose();
  };

  const typeOptions = [
    { value: 'AIR', label: 'Aerien' },
    { value: 'SEA', label: 'Maritime' },
    { value: 'LAND', label: 'Terrestre' },
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
        <div className="space-y-1">
          <AppInput
            label="Designation (optionnel)"
            {...register('designation')}
            error={errors.designation?.message}
            placeholder="Auto-genere si vide (ex: ACME-AIR-DOUALA-001)"
          />
          <p className="text-xs text-gray-500">
            Laissez vide pour generer automatiquement : nom entreprise + type + ville destination + numero.
          </p>
        </div>

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
              if (!v) setValue('parentContainerId', undefined);
            }}
          />
        </div>

        {isForwarding && (
          <Controller
            control={control}
            name="parentContainerId"
            render={({ field }) => (
              <AppSearchSelect
                label="Conteneur parent"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? undefined)}
                // Tous les conteneurs (peu importe le statut : EMPTY, LOADING,
                // IN_TRANSIT, RECEIVED, UNLOADED) peuvent etre parents. On
                // exclut uniquement les conteneurs d'acheminement (pas de
                // nesting de forwarding) via isForwarding=false. Le backend
                // valide encore le statut au moment du `create` si besoin.
                search={(q, limit) =>
                  searchers.containers(q, limit, { isForwarding: 'false' })
                }
                error={errors.parentContainerId?.message}
                placeholder="Selectionner un conteneur parent"
                required
              />
            )}
          />
        )}

        <AppInput
          label="Transporteur (optionnel)"
          {...register('carrier')}
          error={errors.carrier?.message}
          placeholder="Compagnie / nom du transporteur"
        />

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

        <div className="space-y-1">
          <AppInput
            label={`Capacite (${watch('type') === 'AIR' ? 'kg' : 'm3'})`}
            type="number"
            step="0.01"
            {...register('capacity', { valueAsNumber: true })}
            error={errors.capacity?.message}
          />
          <p className="text-xs text-gray-500">
            {watch('type') === 'AIR'
              ? 'Conteneur aerien : capacite exprimee en kilogrammes (kg).'
              : watch('type') === 'SEA'
                ? 'Conteneur maritime : capacite exprimee en metres cubes (m3).'
                : watch('type') === 'LAND'
                  ? 'Conteneur terrestre : capacite exprimee en metres cubes (m3).'
                  : 'Selectionnez un type pour adapter l\'unite.'}
          </p>
        </div>

        <Controller
          control={control}
          name="departureAgencyId"
          render={({ field }) => (
            <AppSearchSelect
              label="Agence de depart"
              value={field.value}
              onChange={(v) => field.onChange(v ?? '')}
              search={searchers.agencies}
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
              search={searchers.agencies}
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
              search={searchers.transitRoutes}
              placeholder="Optionnel"
            />
          )}
        />

      </form>
    </AppDialog>
  );
}
