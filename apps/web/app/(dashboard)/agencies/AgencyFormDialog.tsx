'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createAgencySchema, type CreateAgencyInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { AppCountrySelect, AppCitySelect, AppStateSelect } from '@/components/ui/AppCountryCitySelect';
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
  const [countryId, setCountryId] = useState<number>(0);
  const [stateId, setStateId] = useState<number>(0);
  const [phoneCountryIso, setPhoneCountryIso] = useState<string | undefined>();

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
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
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <AppPhoneInput
                label="Telephone"
                value={field.value}
                onChange={field.onChange}
                onCountryChange={(c) => setPhoneCountryIso(c)}
                error={errors.phone?.message}
              />
            )}
          />
          <AppInput label="Adresse" {...register('address')} error={errors.address?.message} />
          <AppCountrySelect
            label="Pays"
            error={errors.country?.message}
            iso2={phoneCountryIso}
            onChange={(val) => { setValue('country', val); setStateId(0); }}
            onCountryIdChange={(id) => { setCountryId(id); setStateId(0); }}
          />
          <AppStateSelect
            label="Region"
            countryId={countryId}
            onStateIdChange={setStateId}
            onChange={() => {}}
          />
          <AppCitySelect
            label="Ville"
            error={errors.city?.message}
            countryId={countryId}
            stateId={stateId}
            onChange={(val) => setValue('city', val)}
          />
          <AppInput label="Email" type="email" {...register('email')} error={errors.email?.message} />
          <AppInput label="Lien Google Maps" {...register('googleMapsLink')} error={errors.googleMapsLink?.message} />
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
