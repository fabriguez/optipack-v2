'use client';

import { useState } from 'react';
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

interface Props { open: boolean; onClose: () => void; }

export function TransitRouteFormDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/transit-routes', data).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transit-routes'] }); toast.success('Route creee'); onClose(); },
    onError: () => toast.error('Erreur'),
  });

  const [depCountryId, setDepCountryId] = useState<number>(0);
  const [depStateId, setDepStateId] = useState<number>(0);
  const [arrCountryId, setArrCountryId] = useState<number>(0);
  const [arrStateId, setArrStateId] = useState<number>(0);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<CreateTransitRouteInput>({
    resolver: zodResolver(createTransitRouteSchema),
  });

  const onSubmit = (data: CreateTransitRouteInput) => { mutation.mutate(data); reset(); };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouvelle route de transit"
      size="lg"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" form="transit-route-form" loading={mutation.isPending}>Creer</AppButton>
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

        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
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
        </div>

        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
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
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AppInput label="Prix par kg" type="number" step="0.01" {...register('pricePerKg', { valueAsNumber: true })} error={errors.pricePerKg?.message} />
          <AppInput label="Prix par m3" type="number" step="0.01" {...register('pricePerVolume', { valueAsNumber: true })} />
          <AppInput label="Delai estime (jours)" type="number" {...register('estimatedDurationDays', { valueAsNumber: true })} />
        </div>
      </form>
    </AppDialog>
  );
}
