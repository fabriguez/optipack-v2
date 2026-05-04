'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createAgencySchema, type CreateAgencyInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { AppCountrySelect, AppCitySelect, AppStateSelect } from '@/components/ui/AppCountryCitySelect';
import { useCreateAgency, useUpdateAgency } from '@/lib/hooks/useAgencies';
import { ImageDropzone } from '@/components/shared/ImageDropzone';
import { agenciesApi } from '@/lib/api/agencies';
import { toast } from 'sonner';

interface AgencyFormDialogProps {
  open: boolean;
  onClose: () => void;
  agency?: any;
}

export function AgencyFormDialog({ open, onClose, agency }: AgencyFormDialogProps) {
  const isEdit = !!agency;
  const createMutation = useCreateAgency();
  const updateMutation = useUpdateAgency();
  const qc = useQueryClient();
  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const [countryId, setCountryId] = useState<number>(0);
  const [stateId, setStateId] = useState<number>(0);
  const [phoneCountryIso, setPhoneCountryIso] = useState<string | undefined>();
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const invalidateAgencies = () => {
    qc.invalidateQueries({ queryKey: ['agencies'] });
    if (agency?.id) qc.invalidateQueries({ queryKey: ['agencies', agency.id] });
  };

  const handleImageUploadInline = async (file: File) => {
    if (!agency?.id) {
      // Mode creation : on memorise le fichier, on l'enverra apres la creation
      setPendingImage(file);
      setPendingPreview(URL.createObjectURL(file));
      return;
    }
    // Mode edition : upload immediat
    setUploadingImage(true);
    try {
      await agenciesApi.uploadImage(agency.id, file);
      toast.success('Image mise a jour');
      invalidateAgencies();
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageClear = async () => {
    if (!agency?.id) {
      setPendingImage(null);
      setPendingPreview(null);
      return;
    }
    setUploadingImage(true);
    try {
      await agenciesApi.deleteImage(agency.id);
      toast.success('Image supprimee');
      invalidateAgencies();
    } finally {
      setUploadingImage(false);
    }
  };

  // Defauts : on retire imageUrl/imageKey/code etc. (pas dans le formulaire ou non
  // editables). Sinon le resolver zod recoit des champs inattendus.
  const formDefaults: Partial<CreateAgencyInput> = agency
    ? {
        name: agency.name,
        address: agency.address,
        city: agency.city,
        country: agency.country,
        phone: agency.phone,
        email: agency.email ?? '',
        googleMapsLink: agency.googleMapsLink ?? '',
        responsibleUserId: agency.responsibleUserId ?? undefined,
      }
    : {};

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<CreateAgencyInput>({
    resolver: zodResolver(createAgencySchema),
    defaultValues: formDefaults,
  });

  const onSubmit = async (data: CreateAgencyInput) => {
    if (isEdit) {
      await updateMutation.mutateAsync({ id: agency.id, data });
    } else {
      const created = await createMutation.mutateAsync(data);
      const newAgencyId = (created as any)?.data?.id;
      if (newAgencyId && pendingImage) {
        try {
          await agenciesApi.uploadImage(newAgencyId, pendingImage);
        } catch {
          toast.error("L'agence a ete creee mais l'image n'a pas pu etre uploadee.");
        }
      }
    }
    setPendingImage(null);
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingPreview(null);
    reset();
    onClose();
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier l\'agence' : 'Nouvelle agence'}
      size="lg"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton type="submit" form="agency-form" loading={isSubmitting}>
            {isEdit ? 'Enregistrer' : 'Creer'}
          </AppButton>
        </>
      }
    >
      <form id="agency-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
        <ImageDropzone
          label="Photo de l'agence"
          value={pendingPreview ?? agency?.imageUrl ?? null}
          onFile={handleImageUploadInline}
          onClear={agency?.imageUrl || pendingPreview ? handleImageClear : undefined}
          uploading={uploadingImage}
          hint={
            isEdit
              ? 'Glissez une nouvelle image pour la remplacer (JPG, PNG, WEBP, max 5 MB)'
              : 'Glissez une image. Elle sera enregistree juste apres la creation.'
          }
        />
      </form>
    </AppDialog>
  );
}
