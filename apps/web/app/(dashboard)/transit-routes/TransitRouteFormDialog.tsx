'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createTransitRouteSchema,
  updateTransitRouteSchema,
  type CreateTransitRouteInput,
} from '@transitsoftservices/shared';
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

  const { register, handleSubmit, reset, setValue, control, formState: { errors } } = useForm<CreateTransitRouteInput>({
    // Validation cote client active en creation ET edition : sans elle, on
    // pouvait soumettre une route SEA sans prix au m3 (la regle metier est
    // dans le schema partage).
    resolver: zodResolver(isEdit ? (updateTransitRouteSchema as any) : createTransitRouteSchema),
  });

  // Surveille le type pour afficher les bons champs prix (AIR=kg, SEA=m3,
  // LAND=les deux). Le champ inutilise est mis a 0 a la soumission.
  const watchedType = useWatch({ control, name: 'type' }) as 'AIR' | 'SEA' | 'LAND' | undefined;
  const showKg = watchedType === 'AIR' || watchedType === 'LAND' || !watchedType;
  const showM3 = watchedType === 'SEA' || watchedType === 'LAND';

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
    // On force a null le prix non pertinent pour le type choisi (la DB autorise
    // maintenant null). pricePerKg null sur SEA, pricePerVolume null sur AIR.
    const pricePerKg = data.type === 'SEA'
      ? null
      : (data.pricePerKg != null && Number(data.pricePerKg) > 0 ? Number(data.pricePerKg) : null);
    const pricePerVolume = data.type === 'AIR'
      ? null
      : (data.pricePerVolume != null && Number(data.pricePerVolume) > 0 ? Number(data.pricePerVolume) : null);
    const payload = {
      name: data.name,
      type: data.type,
      pricePerKg,
      pricePerVolume,
      estimatedDurationDays: data.estimatedDurationDays,
    };
    if (isEdit) {
      mutation.mutate(payload);
    } else {
      mutation.mutate({
        ...data,
        pricePerKg,
        pricePerVolume,
      });
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

        {/* Champs de prix conditionnels au type de transport.
            AIR : kg uniquement -- pricePerVolume forcee a 0 a la soumission.
            SEA : m3 uniquement -- pricePerKg forcee a 0 a la soumission.
            LAND : les deux acceptes (la facturation prend MAX(kg, m3)). */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {showKg && (
            <AppInput
              label="Prix par kg"
              type="number"
              step="0.01"
              {...register('pricePerKg', { valueAsNumber: true })}
              error={errors.pricePerKg?.message}
            />
          )}
          {showM3 && (
            <AppInput
              label="Prix par m3"
              type="number"
              step="0.01"
              {...register('pricePerVolume', { valueAsNumber: true })}
              error={(errors as any).pricePerVolume?.message}
            />
          )}
          <AppInput
            label="Delai estime (jours)"
            type="number"
            {...register('estimatedDurationDays', { valueAsNumber: true })}
          />
        </div>
        {watchedType && (
          <p className="text-xs text-gray-500">
            {watchedType === 'AIR'
              ? 'Route aerienne : facturation au kilogramme uniquement.'
              : watchedType === 'SEA'
                ? 'Route maritime : facturation au metre cube uniquement.'
                : 'Route terrestre : facturation au kg et/ou au m3. Le montant retenu sera le plus eleve des deux.'}
          </p>
        )}
      </form>
    </AppDialog>
  );
}
