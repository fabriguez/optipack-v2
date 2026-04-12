'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createTransitRouteSchema, type CreateTransitRouteInput } from '@optipack/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
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

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateTransitRouteInput>({
    resolver: zodResolver(createTransitRouteSchema),
  });

  const onSubmit = (data: CreateTransitRouteInput) => { mutation.mutate(data); reset(); };

  return (
    <AppDialog open={open} onClose={onClose} title="Nouvelle route de transit" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppInput label="Nom" {...register('name')} error={errors.name?.message} />
          <AppSelect label="Type" {...register('type')} error={errors.type?.message} options={[
            { value: 'AIR', label: 'Aerien' }, { value: 'SEA', label: 'Maritime' }, { value: 'LAND', label: 'Terrestre' },
          ]} placeholder="Selectionner" />
          <AppInput label="Ville de depart" {...register('departureCity')} error={errors.departureCity?.message} />
          <AppInput label="Pays de depart" {...register('departureCountry')} error={errors.departureCountry?.message} />
          <AppInput label="Ville d'arrivee" {...register('arrivalCity')} error={errors.arrivalCity?.message} />
          <AppInput label="Pays d'arrivee" {...register('arrivalCountry')} error={errors.arrivalCountry?.message} />
          <AppInput label="Prix par kg" type="number" step="0.01" {...register('pricePerKg', { valueAsNumber: true })} error={errors.pricePerKg?.message} />
          <AppInput label="Prix par m3" type="number" step="0.01" {...register('pricePerVolume', { valueAsNumber: true })} />
          <AppInput label="Delai estime (jours)" type="number" {...register('estimatedDurationDays', { valueAsNumber: true })} />
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" loading={mutation.isPending}>Creer</AppButton>
        </div>
      </form>
    </AppDialog>
  );
}
