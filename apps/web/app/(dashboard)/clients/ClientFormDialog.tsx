'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClientSchema, type CreateClientInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { useCreateClient } from '@/lib/hooks/useClients';
import { searchers } from '@/lib/api/searchers';

interface ClientFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-selection (lock) de l'agence — utilise depuis la page detail agence */
  defaultAgency?: { id: string; name: string; city?: string | null } | null;
}

export function ClientFormDialog({ open, onClose, defaultAgency }: ClientFormDialogProps) {
  const createMutation = useCreateClient();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateClientInput>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      clientType: 'INDIVIDUAL',
      loyaltyTier: 'STANDARD',
      isActive: true,
      agencyId: defaultAgency?.id,
    },
  });

  const onSubmit = async (data: CreateClientInput) => {
    await createMutation.mutateAsync(data);
    reset({ clientType: 'INDIVIDUAL', loyaltyTier: 'STANDARD', isActive: true });
    onClose();
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouveau client"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" form="client-form" loading={createMutation.isPending}>Creer</AppButton>
        </>
      }
    >
      <form id="client-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <AppInput label="Nom complet" {...register('fullName')} error={errors.fullName?.message} />
        <Controller
          name="phone"
          control={control}
          render={({ field }) => (
            <AppPhoneInput
              label="Telephone"
              value={field.value}
              onChange={field.onChange}
              error={errors.phone?.message}
            />
          )}
        />
        <AppInput label="Email" type="email" {...register('email')} error={errors.email?.message} />
        <AppInput label="Adresse" {...register('address')} error={errors.address?.message} />

        <div className="grid grid-cols-2 gap-3">
          <Controller
            name="clientType"
            control={control}
            render={({ field }) => (
              <AppSelect
                label="Type de client"
                value={field.value}
                onValueChange={(v) => field.onChange(v)}
                options={[
                  { value: 'INDIVIDUAL', label: 'Particulier' },
                  { value: 'COMPANY', label: 'Entreprise' },
                  { value: 'PARTNER', label: 'Partenaire (tarif dedie)' },
                ]}
              />
            )}
          />
          <Controller
            name="loyaltyTier"
            control={control}
            render={({ field }) => (
              <AppSelect
                label="Statut fidelite"
                value={field.value}
                onValueChange={(v) => field.onChange(v)}
                options={[
                  { value: 'STANDARD', label: 'Standard' },
                  { value: 'SILVER', label: 'Silver' },
                  { value: 'GOLD', label: 'Gold' },
                  { value: 'VIP', label: 'VIP' },
                ]}
              />
            )}
          />
        </div>

        <Controller
          name="agencyId"
          control={control}
          render={({ field }) => (
            <AppSearchSelect
              label="Agence"
              value={field.value}
              onChange={(v) => field.onChange(v ?? '')}
              search={(q, l) => searchers.agencies(q, l)}
              selectedOption={
                defaultAgency
                  ? { value: defaultAgency.id, label: defaultAgency.name, sublabel: defaultAgency.city ?? null }
                  : undefined
              }
              error={errors.agencyId?.message}
              required
              disabled={!!defaultAgency}
              placeholder="Selectionner une agence"
            />
          )}
        />

      </form>
    </AppDialog>
  );
}
