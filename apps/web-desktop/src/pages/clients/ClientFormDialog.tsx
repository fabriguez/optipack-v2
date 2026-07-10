
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
import { usePermission } from '@/lib/hooks/usePermission';

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
    agencyId: string | null;
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
  const canManagePartner = usePermission('client.partner.manage');
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
  // Files en attente d'upload : utilise quand l'utilisateur ajoute des images
  // AVANT d'avoir enregistre le client (pas encore d'editableId). On uploade
  // tout en lot apres la creation.
  const [pendingFiles, setPendingFiles] = useState<Record<Slot, File | null>>({
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
      // Revoke les blob URL locales (CNI en attente) pour eviter les fuites.
      Object.values(photoUrls).forEach((u) => {
        if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
      });
      setPhotoUrls({ profile: null, idDocument: null, idDocumentBack: null });
      setPendingFiles({ profile: null, idDocument: null, idDocumentBack: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client, defaultAgency, reset, setValue]);

  // Uploads les fichiers mis en attente (creation initiale sans id puis save).
  const flushPendingFiles = async (id: string) => {
    const slots: Slot[] = ['profile', 'idDocument', 'idDocumentBack'];
    for (const slot of slots) {
      const file = pendingFiles[slot];
      if (!file) continue;
      setBusy(slot);
      try {
        const formData = new FormData();
        formData.append('image', file);
        const res = await apiClient.post(`/clients/${id}/image/${slot}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const fields: Record<Slot, string> = {
          profile: 'imageUrl',
          idDocument: 'idDocumentUrl',
          idDocumentBack: 'idDocumentBackUrl',
        };
        const url = res.data?.data?.[fields[slot]];
        if (url) setPhotoUrls((s) => ({ ...s, [slot]: url }));
      } catch (e: any) {
        toast.error(`${SLOT_LABELS[slot]} : ${e?.response?.data?.message || 'echec upload'}`);
      } finally {
        setBusy(null);
      }
    }
    setPendingFiles({ profile: null, idDocument: null, idDocumentBack: null });
  };

  const onSubmit = async (data: CreateClientInput) => {
    if (isEdit) {
      await updateMutation.mutateAsync(data);
      onClose();
    } else {
      const created = await createMutation.mutateAsync(data);
      const id = (created as any)?.data?.id;
      if (id) {
        setEditableId(id);
        // Uploade les CNI/profile mis en attente avant la creation.
        await flushPendingFiles(id);
        qc.invalidateQueries({ queryKey: ['clients'] });
      } else {
        onClose();
      }
    }
  };

  const uploadPhoto = async (slot: Slot, file: File) => {
    if (!editableId) {
      // Creation : on ne peut pas encore uploader (pas d'id). On stocke le
      // fichier localement, on cree un preview blob URL et on uploadera apres
      // la creation reussie via flushPendingFiles().
      const previousBlob = pendingFiles[slot];
      if (previousBlob) {
        // Revoke l'ancien object URL pour eviter une fuite memoire.
        const oldPreview = photoUrls[slot];
        if (oldPreview && oldPreview.startsWith('blob:')) {
          URL.revokeObjectURL(oldPreview);
        }
      }
      const previewUrl = URL.createObjectURL(file);
      setPendingFiles((s) => ({ ...s, [slot]: file }));
      setPhotoUrls((s) => ({ ...s, [slot]: previewUrl }));
      toast.info('Image en attente. Sera uploadee a l\'enregistrement.');
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
    // Si l'image est juste en attente locale (creation pas encore enregistree),
    // on la retire de la queue + revoke le blob URL, sans appeler l'API.
    if (!editableId) {
      const preview = photoUrls[slot];
      if (preview && preview.startsWith('blob:')) URL.revokeObjectURL(preview);
      setPendingFiles((s) => ({ ...s, [slot]: null }));
      setPhotoUrls((s) => ({ ...s, [slot]: null }));
      return;
    }
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
          <p className="text-xs text-gray-500 sm:col-span-2 -mt-1">
            Renseignez au moins un telephone ou un email.
          </p>
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
                // Statut partenaire : reserve a la cle client.partner.manage.
                // Sans elle, PARTNER n'est ni selectionnable ni retirable
                // (select verrouille si le client est deja partenaire).
                disabled={!canManagePartner && field.value === 'PARTNER'}
                options={[
                  { value: 'INDIVIDUAL', label: 'Particulier' },
                  { value: 'COMPANY', label: 'Entreprise' },
                  ...(canManagePartner || field.value === 'PARTNER'
                    ? [{ value: 'PARTNER', label: 'Partenaire (tarif dedie)' }]
                    : []),
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
                label="Agence d'enregistrement (optionnel)"
                value={field.value}
                onChange={(v) => field.onChange(v ?? null)}
                search={searchers.agencies}
                selectedOption={defaultAgency ? toSearchOption.agency(defaultAgency) : undefined}
                error={errors.agencyId?.message}
                disabled={!!defaultAgency || !!editableId}
                placeholder="Aucune agence (client global a l'organisation)"
                clearable
                className="sm:col-span-2"
              />
            )}
          />
        </div>

        <div className="mt-4 rounded-xl border border-gray-100 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Contact d&apos;urgence (optionnel)
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppInput label="Nom" {...register('emergencyContactName' as any)} placeholder="Nom complet" />
            <AppInput label="Lien" {...register('emergencyContactRelation' as any)} placeholder="Conjoint, parent..." />
            <Controller
              name={'emergencyContactPhone' as any}
              control={control}
              render={({ field }) => (
                <AppPhoneInput
                  label="Telephone"
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
        </div>
      </form>

      <div className="mt-6 border-t border-gray-100 pt-4">
        <p className="mb-2 text-sm font-medium text-gray-900">Photos</p>
        <p className="mb-3 text-xs text-gray-500">
          Le profil est optionnel. Le recto et verso de la CNI sont utilises lors du retrait
          d&apos;un colis pour confronter visuellement la personne en face.
        </p>
        {!editableId && (
          <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
            Mode creation : les photos sont memorisees et uploadees a l&apos;enregistrement.
          </p>
        )}
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
      </div>
    </AppDialog>
  );
}
