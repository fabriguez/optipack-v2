'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createAgencySchema, type CreateAgencyInput } from '@optipack/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { useCreateAgency, useUpdateAgency } from '@/lib/hooks/useAgencies';

interface AgencyFormDialogProps {
  open: boolean;
  onClose: () => void;
  agency?: any;
}

export function AgencyFormDialog({ open, onClose, agency }: AgencyFormDialogProps) {
  const isEdit = !!agency;
  const createMutation = useCreateAgency();
  const updateMutation = useUpdateAgency();
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateAgencyInput>({
    resolver: zodResolver(createAgencySchema),
    defaultValues: agency || {},
  });

  const onSubmit = async (data: CreateAgencyInput) => {
    if (isEdit) {
      await updateMutation.mutateAsync({ id: agency.id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
    reset();
    onClose();
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier l\'agence' : 'Nouvelle agence'}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppInput label="Nom de l'agence" {...register('name')} error={errors.name?.message} />
          <AppInput label="Telephone" {...register('phone')} error={errors.phone?.message} />
          <AppInput label="Adresse" {...register('address')} error={errors.address?.message} />
          <AppInput label="Ville" {...register('city')} error={errors.city?.message} />
          <AppInput label="Pays" {...register('country')} error={errors.country?.message} />
          <AppInput label="Email" type="email" {...register('email')} error={errors.email?.message} />
          <AppInput label="Lien Google Maps" {...register('googleMapsLink')} error={errors.googleMapsLink?.message} className="sm:col-span-2" />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <AppButton variant="ghost" type="button" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton type="submit" loading={isSubmitting}>
            {isEdit ? 'Enregistrer' : 'Creer'}
          </AppButton>
        </div>
      </form>
    </AppDialog>
  );
}
