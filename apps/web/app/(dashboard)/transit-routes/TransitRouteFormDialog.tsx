'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createTransitRouteSchema, type CreateTransitRouteInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppCountrySelect, AppCitySelect, AppStateSelect } from '@/components/ui/AppCountryCitySelect';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Si fourni, le dialog passe en mode edition (la geographie n'est pas modifiable apres creation) */
  route?: {
    id: string;
    name: string;
    type: string;
    pricePerKg: number | string;
    pricePerVolume?: number | string | null;
    estimatedDurationDays?: number | null;
  } | null;
}

export function TransitRouteFormDialog({ open, onClose, route }: Props) {
  const qc = useQueryClient();
  const isEdit = !!route;
  const mutation = useMutation({
    mutationFn: (data: any) =>
      isEdit
        ? apiClient.patch(`/transit-routes/${route!.id}`, data).then((r) => r.data)
        : apiClient.post('/transit-routes', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transit-routes'] });
      toast.success(isEdit ? 'Route mise a jour' : 'Route creee');
      onClose();
    },
    onError: () => toast.error('Erreur'),
  });

  const [depCountryId, setDepCountryId] = useState<number>(0);
  const [depStateId, setDepStateId] = useState<number>(0);
  const [arrCountryId, setArrCountryId] = useState<number>(0);
  const [arrStateId, setArrStateId] = useState<number>(0);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<CreateTransitRouteInput>({
    resolver: isEdit ? undefined : zodResolver(createTransitRouteSchema),
  });

  useEffect(() => {
    if (open && route) {
      reset({
        name: route.name,
        type: route.type as any,
        pricePerKg: Number(route.pricePerKg),
        pricePerVolume: route.pricePerVolume != null ? Number(route.pricePerVolume) : undefined,
        estimatedDurationDays: route.estimatedDurationDays ?? undefined,
      } as any);
    } else if (open && !route) {
      reset();
    }
  }, [open, route, reset]);

  const onSubmit = (data: CreateTransitRouteInput) => {
    if (isEdit) {
      mutation.mutate({
        name: data.name,
        type: data.type,
        pricePerKg: data.pricePerKg,
        pricePerVolume: data.pricePerVolume,
        estimatedDurationDays: data.estimatedDurationDays,
      });
    } else {
      mutation.mutate(data);
    }
    reset();
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier la route de transit' : 'Nouvelle route de transit'}
      size="lg"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" form="transit-route-form" loading={mutation.isPending}>{isEdit ? 'Enregistrer' : 'Creer'}</AppButton>
        </>
      }
    >
      <form id="transit-route-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppInput label="Nom" {...register('name')} error={errors.name?.message} />
          <AppSelect label="Type" {...register('type')} error={errors.type?.message} options={[
            { value: 'AIR', label: 'Aerien' }, { value: 'SEA', label: 'Maritime' }, { value: 'LAND', label: 'Terrestre' },
          ]} placeholder="Selectionner" />
        </div>

        {!isEdit && <div className="border border-gray-100 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Depart</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <AppCountrySelect
              label="Pays de depart"
              error={errors.departureCountry?.message}
              onChange={(val) => { setValue('departureCountry', val); setDepStateId(0); }}
              onCountryIdChange={(id) => { setDepCountryId(id); setDepStateId(0); }}
            />
            <AppStateSelect
              label="Region"
              countryId={depCountryId}
              onStateIdChange={setDepStateId}
              onChange={() => {}}
            />
            <AppCitySelect
              label="Ville de depart"
              error={errors.departureCity?.message}
              countryId={depCountryId}
              stateId={depStateId}
              onChange={(val) => setValue('departureCity', val)}
            />
          </div>
        </div>}

        {!isEdit && <div className="border border-gray-100 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Arrivee</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <AppCountrySelect
              label="Pays d'arrivee"
              error={errors.arrivalCountry?.message}
              onChange={(val) => { setValue('arrivalCountry', val); setArrStateId(0); }}
              onCountryIdChange={(id) => { setArrCountryId(id); setArrStateId(0); }}
            />
            <AppStateSelect
              label="Region"
              countryId={arrCountryId}
              onStateIdChange={setArrStateId}
              onChange={() => {}}
            />
            <AppCitySelect
              label="Ville d'arrivee"
              error={errors.arrivalCity?.message}
              countryId={arrCountryId}
              stateId={arrStateId}
              onChange={(val) => setValue('arrivalCity', val)}
            />
          </div>
        </div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AppInput label="Prix par kg" type="number" step="0.01" {...register('pricePerKg', { valueAsNumber: true })} error={errors.pricePerKg?.message} />
          <AppInput label="Prix par m3" type="number" step="0.01" {...register('pricePerVolume', { valueAsNumber: true })} />
          <AppInput label="Delai estime (jours)" type="number" {...register('estimatedDurationDays', { valueAsNumber: true })} />
        </div>
      </form>
    </AppDialog>
  );
}
