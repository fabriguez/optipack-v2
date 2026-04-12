'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClientSchema, type CreateClientInput } from '@optipack/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { useCreateClient } from '@/lib/hooks/useClients';
import { useAgencies } from '@/lib/hooks/useAgencies';

interface ClientFormDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ClientFormDialog({ open, onClose }: ClientFormDialogProps) {
  const createMutation = useCreateClient();
  const { data: agencies } = useAgencies({ limit: 100 });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateClientInput>({
    resolver: zodResolver(createClientSchema),
  });

  const onSubmit = async (data: CreateClientInput) => {
    await createMutation.mutateAsync(data);
    reset();
    onClose();
  };

  const agencyOptions = (agencies?.data || []).map((a: any) => ({
    value: a.id,
    label: `${a.name} (${a.code})`,
  }));

  return (
    <AppDialog open={open} onClose={onClose} title="Nouveau client" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <AppInput label="Nom complet" {...register('fullName')} error={errors.fullName?.message} />
        <AppInput label="Telephone" {...register('phone')} error={errors.phone?.message} />
        <AppInput label="Email" type="email" {...register('email')} error={errors.email?.message} />
        <AppInput label="Adresse" {...register('address')} error={errors.address?.message} />
        <AppSelect
          label="Agence"
          {...register('agencyId')}
          error={errors.agencyId?.message}
          options={agencyOptions}
          placeholder="Selectionner une agence"
        />

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" loading={createMutation.isPending}>Creer</AppButton>
        </div>
      </form>
    </AppDialog>
  );
}
