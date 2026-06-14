'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createContainerSchema, type CreateContainerInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppSwitch } from '@/components/ui/AppSwitch';
import { useCreateContainer, useUpdateContainer } from '@/lib/hooks/useContainers';
import { searchers, toSearchOption } from '@/lib/api/searchers';
import { useAgency } from '@/lib/hooks/useAgencies';
import { Plus } from 'lucide-react';
import { CarrierFormDialog } from './CarrierFormDialog';

interface ContainerLike {
  id: string;
  designation: string;
  type: 'AIR' | 'SEA' | 'LAND';
  isForwarding: boolean;
  carrier?: string | null;
  carrierId?: string | null;
  carrierCost?: number | string | null;
  carrierEntity?: { id: string; name: string } | null;
  capacity: number | string;
  departureAgencyId?: string;
  arrivalAgencyId?: string;
  transitRouteId?: string | null;
  departureAgency?: { id: string; name: string } | null;
  arrivalAgency?: { id: string; name: string } | null;
  transitRoute?: { id: string; name: string } | null;
}

interface ContainerFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Si fourni : mode edition (PATCH). Possible tant que statut EMPTY/LOADING. */
  container?: ContainerLike | null;
  /** Agence de l'employe courant. Pre-selectionne et verrouille l'agence de depart. */
  userAgencyId?: string;
}

export function ContainerFormDialog({ open, onClose, container: editTarget, userAgencyId }: ContainerFormDialogProps) {
  const createMutation = useCreateContainer();
  const updateMutation = useUpdateContainer();
  const isEdit = !!editTarget;
  const [isForwarding, setIsForwarding] = useState(false);
  // Resout le nom de l'agence de l'employe pour l'affichage dans le select desactive.
  const { data: userAgencyResp } = useAgency(userAgencyId ?? '');
  const [showCarrierDialog, setShowCarrierDialog] = useState(false);

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

  useEffect(() => {
    if (!open) return;
    if (editTarget) {
      reset({
        designation: editTarget.designation,
        type: editTarget.type,
        isForwarding: editTarget.isForwarding,
        carrier: editTarget.carrier ?? undefined,
        carrierId: editTarget.carrierEntity?.id ?? editTarget.carrierId ?? undefined,
        carrierCost: editTarget.carrierCost != null ? Number(editTarget.carrierCost) : 0,
        capacity: Number(editTarget.capacity),
        departureAgencyId: editTarget.departureAgency?.id ?? editTarget.departureAgencyId ?? '',
        arrivalAgencyId: editTarget.arrivalAgency?.id ?? editTarget.arrivalAgencyId ?? '',
        transitRouteId: editTarget.transitRoute?.id ?? editTarget.transitRouteId ?? undefined,
      } as CreateContainerInput);
      setIsForwarding(editTarget.isForwarding);
    } else {
      reset({ isForwarding: false, departureAgencyId: userAgencyId ?? '' } as CreateContainerInput);
      setIsForwarding(false);
    }
  }, [open, editTarget, reset]);

  const onSubmit = async (data: CreateContainerInput) => {
    if (isEdit && editTarget) {
      await updateMutation.mutateAsync({
        id: editTarget.id,
        data: {
          designation: data.designation || undefined,
          type: data.type,
          carrier: data.carrier || null,
          carrierId: (data as any).carrierId || null,
          carrierCost: (data as any).carrierCost ?? 0,
          capacity: data.capacity,
          departureAgencyId: data.departureAgencyId,
          arrivalAgencyId: data.arrivalAgencyId,
          transitRouteId: data.transitRouteId || undefined,
        },
      });
      onClose();
      return;
    }
    const payload: CreateContainerInput = {
      ...data,
      isForwarding,
      parentContainerId: undefined,
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
    <>
    <AppDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier le conteneur' : 'Nouveau conteneur'}
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton
            type="submit"
            form="container-form"
            loading={createMutation.isPending || updateMutation.isPending}
          >
            {isEdit ? 'Enregistrer' : 'Creer'}
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
            disabled={isEdit}
            onCheckedChange={(v) => {
              setIsForwarding(v);
              setValue('isForwarding', v);
              setValue('parentContainerId', undefined);
            }}
          />
        </div>

        {isForwarding && (
          <p className="rounded-xl bg-primary-50 px-3 py-2 text-xs text-primary-800">
            Les conteneurs parents sont detectes automatiquement : a chaque ajout
            de colis dans ce conteneur, son conteneur d&apos;origine est associe
            comme parent. Pas de selection manuelle requise.
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Controller
                control={control}
                name={'carrierId' as any}
                render={({ field }) => (
                  <AppSearchSelect
                    label="Transporteur"
                    value={field.value || null}
                    onChange={(v) => field.onChange(v ?? undefined)}
                    search={searchers.carriers}
                    placeholder="Selectionner un transporteur"
                  />
                )}
              />
            </div>
            <AppButton
              type="button"
              variant="outline"
              onClick={() => setShowCarrierDialog(true)}
              title="Ajouter un transporteur"
            >
              <Plus className="h-4 w-4" />
            </AppButton>
          </div>
          <AppInput
            label="Cout transporteur (FCFA)"
            type="number"
            step="0.01"
            min={0}
            {...register('carrierCost' as any, { valueAsNumber: true })}
            error={(errors as any).carrierCost?.message}
            placeholder="0"
          />
          <p className="text-xs text-gray-500">
            Si renseigne (&gt; 0), une depense de transport est creee automatiquement
            pour ce conteneur. Pour un conteneur d&apos;acheminement, elle sera
            propagee aux parents au moment du depart.
          </p>
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
          render={({ field }) => {
            const userAgencyObj = (userAgencyResp as any)?.data;
            return (
              <AppSearchSelect
                label="Agence de depart"
                value={field.value}
                onChange={(v) => field.onChange(v ?? '')}
                search={searchers.agencies}
                selectedOption={
                  !isEdit && userAgencyId && userAgencyObj
                    ? toSearchOption.agency(userAgencyObj)
                    : editTarget?.departureAgency
                      ? toSearchOption.agency(editTarget.departureAgency)
                      : undefined
                }
                error={errors.departureAgencyId?.message}
                required
                disabled={!isEdit && !!userAgencyId}
                placeholder="Selectionner"
              />
            );
          }}
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
    {/* Rendu en frere du AppDialog parent : evite la propagation des
        evenements de fermeture (ESC, outside-click) du dialog enfant vers
        le dialog parent (sinon fermer le form transporteur fermait aussi
        le form conteneur). */}
    <CarrierFormDialog
      open={showCarrierDialog}
      onClose={() => setShowCarrierDialog(false)}
      onSaved={(c) => setValue('carrierId' as any, c.id)}
    />
    </>
  );
}
