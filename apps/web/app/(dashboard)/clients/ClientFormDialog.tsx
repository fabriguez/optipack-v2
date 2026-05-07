'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClientSchema, type CreateClientInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { ImageInput } from '@/components/shared/ImageInput';
import { useCreateClient } from '@/lib/hooks/useClients';
import { searchers, toSearchOption } from '@/lib/api/searchers';
import { apiClient } from '@/lib/api/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ClientFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-selection (lock) de l'agence — utilise depuis la page detail agence */
  defaultAgency?: { id: string; name: string; city?: string | null } | null;
  /** Mode edition si fourni */
  client?: {
    id: string;
    fullName: string;
    phone: string;
    email?: string | null;
    address?: string | null;
    idNumber?: string | null;
    agencyId: string;
    clientType?: string | null;
    loyaltyTier?: string | null;
    imageUrl?: string | null;
    idDocumentUrl?: string | null;
    idDocumentBackUrl?: string | null;
  } | null;
}

type Slot = 'profile' | 'idDocument' | 'idDocumentBack';

const SLOT_LABELS: Record<Slot, string> = {
  profile: 'Photo de profil (optionnelle)',
  idDocument: "CNI - Recto",
  idDocumentBack: "CNI - Verso",
};

const SLOT_FACING: Record<Slot, 'user' | 'environment'> = {
  profile: 'user',
  idDocument: 'environment',
  idDocumentBack: 'environment',
};

export function ClientFormDialog({ open, onClose, defaultAgency, client }: ClientFormDialogProps) {
  const isEdit = !!client;
  const qc = useQueryClient();
  const createMutation = useCreateClient();
  const updateMutation = useMutation({
    mutationFn: (data: any) =>
      apiClient.patch(`/clients/${client!.id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client mis a jour');
    },
    onError: () => toast.error('Erreur'),
  });

  const [editableId, setEditableId] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<Slot, string | null>>({
    profile: null,
    idDocument: null,
    idDocumentBack: null,
  });
  const [busy, setBusy] = useState<Slot | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
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

  useEffect(() => {
    if (!open) return;
    if (client) {
      reset({
        fullName: client.fullName,
        phone: client.phone,
        email: client.email ?? '',
        address: client.address ?? '',
        agencyId: client.agencyId,
        clientType: (client.clientType as any) ?? 'INDIVIDUAL',
        loyaltyTier: (client.loyaltyTier as any) ?? 'STANDARD',
        isActive: true,
      });
      setEditableId(client.id);
      setPhotoUrls({
        profile: client.imageUrl ?? null,
        idDocument: client.idDocumentUrl ?? null,
        idDocumentBack: client.idDocumentBackUrl ?? null,
      });
    } else {
      reset({
        clientType: 'INDIVIDUAL',
        loyaltyTier: 'STANDARD',
        isActive: true,
        agencyId: defaultAgency?.id,
      });
      if (defaultAgency?.id) setValue('agencyId', defaultAgency.id, { shouldValidate: true });
      setEditableId(null);
      setPhotoUrls({ profile: null, idDocument: null, idDocumentBack: null });
    }
  }, [open, client, defaultAgency, reset, setValue]);

  const onSubmit = async (data: CreateClientInput) => {
    if (isEdit) {
      await updateMutation.mutateAsync(data);
      onClose();
    } else {
      const created = await createMutation.mutateAsync(data);
      const id = (created as any)?.data?.id;
      if (id) setEditableId(id);
      else onClose();
    }
  };

  const uploadPhoto = async (slot: Slot, file: File) => {
    if (!editableId) {
      toast.info('Enregistrez d\'abord le client.');
      return;
    }
    setBusy(slot);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await apiClient.post(`/clients/${editableId}/image/${slot}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const fields: Record<Slot, string> = {
        profile: 'imageUrl',
        idDocument: 'idDocumentUrl',
        idDocumentBack: 'idDocumentBackUrl',
      };
      const url = res.data?.data?.[fields[slot]];
      if (url) setPhotoUrls((s) => ({ ...s, [slot]: url }));
      toast.success(`${SLOT_LABELS[slot]} mise a jour`);
      qc.invalidateQueries({ queryKey: ['clients'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Echec de l'upload");
    } finally {
      setBusy(null);
    }
  };

  const deletePhoto = async (slot: Slot) => {
    if (!editableId) return;
    setBusy(slot);
    try {
      await apiClient.delete(`/clients/${editableId}/image/${slot}`);
      setPhotoUrls((s) => ({ ...s, [slot]: null }));
      toast.success('Photo supprimee');
      qc.invalidateQueries({ queryKey: ['clients'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Suppression impossible');
    } finally {
      setBusy(null);
    }
  };

  const slotKeys: Slot[] = useMemo(() => ['profile', 'idDocument', 'idDocumentBack'], []);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const dialogTitle = isEdit ? 'Modifier le client' : 'Nouveau client';

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={dialogTitle}
      size="lg"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>
            {editableId && !isEdit ? 'Fermer' : 'Annuler'}
          </AppButton>
          {(!editableId || isEdit) && (
            <AppButton type="submit" form="client-form" loading={isSubmitting}>
              {isEdit ? 'Enregistrer' : 'Creer'}
            </AppButton>
          )}
        </>
      }
    >
      <form id="client-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <AppInput label="N. CNI / Identite" {...register('idNumber' as any)} />
          <AppInput label="Adresse" {...register('address')} error={errors.address?.message} className="sm:col-span-2" />

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

          <Controller
            name="agencyId"
            control={control}
            render={({ field }) => (
              <AppSearchSelect
                label="Agence"
                value={field.value}
                onChange={(v) => field.onChange(v ?? '')}
                search={searchers.agencies}
                selectedOption={defaultAgency ? toSearchOption.agency(defaultAgency) : undefined}
                error={errors.agencyId?.message}
                required
                disabled={!!defaultAgency || !!editableId}
                placeholder="Selectionner une agence"
                className="sm:col-span-2"
              />
            )}
          />
        </div>
      </form>

      <div className="mt-6 border-t border-gray-100 pt-4">
        <p className="mb-2 text-sm font-medium text-gray-900">Photos</p>
        <p className="mb-3 text-xs text-gray-500">
          Le profil est optionnel. Le recto et verso de la CNI sont utilises lors du retrait
          d&apos;un colis pour confronter visuellement la personne en face.
        </p>
        {!editableId ? (
          <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-500">
            Enregistrez d&apos;abord le client pour pouvoir ajouter ses photos.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {slotKeys.map((slot) => (
              <ImageInput
                key={slot}
                label={SLOT_LABELS[slot]}
                value={photoUrls[slot]}
                onFile={(file) => uploadPhoto(slot, file)}
                onClear={() => deletePhoto(slot)}
                uploading={busy === slot}
                cameraFacing={SLOT_FACING[slot]}
                height={140}
                hint={
                  slot === 'profile'
                    ? 'Photo selfie (optionnelle)'
                    : slot === 'idDocument'
                      ? 'Recto CNI / passeport'
                      : 'Verso CNI / passeport'
                }
              />
            ))}
          </div>
        )}
      </div>
    </AppDialog>
  );
}
