'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { ImageInput } from '@/components/shared/ImageInput';
import { searchers, toSearchOption } from '@/lib/api/searchers';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-selection (lock) de l'agence — utilise depuis la page detail agence */
  defaultAgency?: { id: string; name: string; city?: string | null } | null;
  /** Si fourni, le dialog passe en mode edition */
  employee?: {
    id: string;
    fullName: string;
    position: string;
    agencyId: string;
    phone?: string | null;
    idNumber?: string | null;
    baseSalary?: number | string | null;
    selfieUrl?: string | null;
    locationPlanUrl?: string | null;
    idDocumentUrl?: string | null;
  } | null;
}

type Slot = 'selfie' | 'locationPlan' | 'idDocument';

const SLOT_LABELS: Record<Slot, string> = {
  selfie: 'Photo selfie',
  locationPlan: 'Plan de localisation',
  idDocument: 'Document d\'identification',
};

const SLOT_FACING: Record<Slot, 'user' | 'environment'> = {
  selfie: 'user',
  locationPlan: 'environment',
  idDocument: 'environment',
};

export function EmployeeFormDialog({ open, onClose, defaultAgency, employee }: Props) {
  const qc = useQueryClient();
  const isEdit = !!employee;
  const mutation = useMutation({
    mutationFn: (data: any) =>
      isEdit
        ? apiClient.patch(`/employees/${employee!.id}`, data).then((r) => r.data)
        : apiClient.post('/employees', data).then((r) => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['agencies'] }); // pour la masse salariale auto
      toast.success(isEdit ? 'Employe mis a jour' : 'Employe cree');
      // En mode creation, on garde le dialog ouvert pour permettre l'upload des photos.
      if (!isEdit) {
        const created = (res as any)?.data;
        if (created?.id) setEditableId(created.id);
        else onClose();
      } else {
        onClose();
      }
    },
    onError: () => toast.error('Erreur'),
  });

  const { register, handleSubmit, reset, control } = useForm();
  const onSubmit = (data: any) => mutation.mutate({ ...data, baseSalary: Number(data.baseSalary || 0) });

  // editableId : ID utilisable pour uploader les photos (employe.id en edition,
  // ou ID retourne par la creation).
  const [editableId, setEditableId] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<Slot, string | null>>({
    selfie: null,
    locationPlan: null,
    idDocument: null,
  });
  const [busy, setBusy] = useState<Slot | null>(null);

  useEffect(() => {
    if (!open) return;
    if (employee) {
      reset({
        fullName: employee.fullName,
        agencyId: employee.agencyId,
        position: employee.position,
        phone: employee.phone ?? '',
        idNumber: employee.idNumber ?? '',
        baseSalary: employee.baseSalary != null ? Number(employee.baseSalary) : undefined,
      });
      setEditableId(employee.id);
      setPhotoUrls({
        selfie: employee.selfieUrl ?? null,
        locationPlan: employee.locationPlanUrl ?? null,
        idDocument: employee.idDocumentUrl ?? null,
      });
    } else {
      reset(defaultAgency ? { agencyId: defaultAgency.id } : {});
      setEditableId(null);
      setPhotoUrls({ selfie: null, locationPlan: null, idDocument: null });
    }
  }, [open, defaultAgency, employee, reset]);

  const uploadPhoto = async (slot: Slot, file: File) => {
    if (!editableId) {
      toast.info('Enregistrez d\'abord l\'employe avant de televerser des photos.');
      return;
    }
    setBusy(slot);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await apiClient.post(`/employees/${editableId}/image/${slot}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = res.data?.data?.[`${slot}Url`];
      if (url) setPhotoUrls((s) => ({ ...s, [slot]: url }));
      toast.success(`${SLOT_LABELS[slot]} mise a jour`);
      qc.invalidateQueries({ queryKey: ['employees'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Echec de l\'upload');
    } finally {
      setBusy(null);
    }
  };

  const deletePhoto = async (slot: Slot) => {
    if (!editableId) return;
    setBusy(slot);
    try {
      await apiClient.delete(`/employees/${editableId}/image/${slot}`);
      setPhotoUrls((s) => ({ ...s, [slot]: null }));
      toast.success(`${SLOT_LABELS[slot]} supprimee`);
      qc.invalidateQueries({ queryKey: ['employees'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Suppression impossible');
    } finally {
      setBusy(null);
    }
  };

  const dialogTitle = isEdit ? "Modifier l'employe" : 'Nouvel employe';
  const submitLabel = isEdit ? 'Enregistrer' : editableId ? 'Termine' : 'Creer';
  const slotKeys: Slot[] = useMemo(() => ['selfie', 'locationPlan', 'idDocument'], []);

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
          {!editableId && (
            <AppButton type="submit" form="employee-form" loading={mutation.isPending}>
              {submitLabel}
            </AppButton>
          )}
          {editableId && isEdit && (
            <AppButton type="submit" form="employee-form" loading={mutation.isPending}>
              {submitLabel}
            </AppButton>
          )}
        </>
      }
    >
      <form id="employee-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppInput label="Nom complet" {...register('fullName', { required: true })} />
          <Controller
            name="agencyId"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <AppSearchSelect
                label="Agence"
                value={field.value as string | null | undefined}
                onChange={(v) => field.onChange(v ?? '')}
                search={searchers.agencies}
                selectedOption={defaultAgency ? toSearchOption.agency(defaultAgency) : undefined}
                required
                disabled={!!defaultAgency || !!editableId}
                placeholder="Selectionner une agence"
              />
            )}
          />
          <AppInput label="Poste" {...register('position', { required: true })} />
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <AppPhoneInput label="Telephone" value={field.value} onChange={field.onChange} />
            )}
          />
          <AppInput label="N. identite" {...register('idNumber')} />
          <AppInput label="Salaire de base" type="number" {...register('baseSalary')} />
        </div>
      </form>

      <div className="mt-6 border-t border-gray-100 pt-4">
        <p className="mb-2 text-sm font-medium text-gray-900">Photos</p>
        {!editableId ? (
          <p className="text-xs text-gray-500">
            Enregistrez d&apos;abord l&apos;employe pour pouvoir ajouter ses photos (selfie, plan, document).
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
                height={150}
                hint={
                  slot === 'selfie'
                    ? 'Photo du visage (camera frontale)'
                    : slot === 'locationPlan'
                      ? 'Plan ou capture du domicile / itineraire'
                      : 'Carte d\'identite, passeport, etc.'
                }
              />
            ))}
          </div>
        )}
      </div>
    </AppDialog>
  );
}
