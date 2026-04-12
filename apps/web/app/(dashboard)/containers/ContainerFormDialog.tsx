'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createContainerSchema, type CreateContainerInput } from '@optipack/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { useCreateContainer } from '@/lib/hooks/useContainers';
import { useAgencies } from '@/lib/hooks/useAgencies';

interface ContainerFormDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ContainerFormDialog({ open, onClose }: ContainerFormDialogProps) {
  const createMutation = useCreateContainer();
  const { data: agencies } = useAgencies({ limit: 100 });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateContainerInput>({
    resolver: zodResolver(createContainerSchema),
  });

  const onSubmit = async (data: CreateContainerInput) => {
    await createMutation.mutateAsync(data);
    reset();
    onClose();
  };

  const agencyOptions = (agencies?.data || []).map((a: any) => ({
    value: a.id,
    label: `${a.name} (${a.code})`,
  }));

  return (
    <AppDialog open={open} onClose={onClose} title="Nouveau conteneur" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <AppInput label="Designation" {...register('designation')} error={errors.designation?.message} />
        <AppSelect
          label="Type"
          {...register('type')}
          error={errors.type?.message}
          options={[
            { value: 'AIR', label: 'Aerien' },
            { value: 'SEA', label: 'Maritime' },
            { value: 'LAND', label: 'Terrestre' },
          ]}
          placeholder="Selectionner un type"
        />
        <AppInput label="Capacite (kg)" type="number" {...register('capacity', { valueAsNumber: true })} error={errors.capacity?.message} />
        <AppSelect label="Agence de depart" {...register('departureAgencyId')} error={errors.departureAgencyId?.message} options={agencyOptions} placeholder="Selectionner" />
        <AppSelect label="Agence d'arrivee" {...register('arrivalAgencyId')} error={errors.arrivalAgencyId?.message} options={agencyOptions} placeholder="Selectionner" />

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" loading={createMutation.isPending}>Creer</AppButton>
        </div>
      </form>
    </AppDialog>
  );
}
