'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { ImageInput } from '@/components/shared/ImageInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { searchers, toSearchOption } from '@/lib/api/searchers';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import { usePositions } from '@/lib/hooks/useHR';

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
    positionId?: string | null;
    agencyId: string;
    phone?: string | null;
    idNumber?: string | null;
    baseSalary?: number | string | null;
    educationLevel?: string | null;
    specialty?: string | null;
    contractType?: 'STAGIAIRE' | 'CDD' | 'CDI' | 'PRESTATAIRE' | null;
    managerId?: string | null;
    isAgencyManager?: boolean | null;
    selfieUrl?: string | null;
    locationPlanUrl?: string | null;
    idDocumentUrl?: string | null;
    idDocumentBackUrl?: string | null;
  } | null;
}

type Slot = 'selfie' | 'locationPlan' | 'idDocument' | 'idDocumentBack';

const SLOT_LABELS: Record<Slot, string> = {
  selfie: 'Photo selfie',
  locationPlan: 'Plan de localisation',
  idDocument: "Document d'identification (recto)",
  idDocumentBack: "Document d'identification (verso)",
};

const SLOT_FACING: Record<Slot, 'user' | 'environment'> = {
  selfie: 'user',
  locationPlan: 'environment',
  idDocument: 'environment',
  idDocumentBack: 'environment',
};

const CONTRACT_TYPE_OPTIONS = [
  { value: 'CDI', label: 'CDI' },
  { value: 'CDD', label: 'CDD' },
  { value: 'STAGIAIRE', label: 'Stagiaire' },
  { value: 'PRESTATAIRE', label: 'Prestataire' },
];

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
      if (!isEdit) {
        const created = (res as any)?.data;
        if (created?.id) setEditableId(created.id);
        // Affiche le matricule genere (ou saisi) dans le form pour copie rapide.
        if (created?.idNumber) {
          setValue('idNumber', created.idNumber, { shouldValidate: false });
          toast.message(`Matricule : ${created.idNumber}`);
        }
        if (created?.initialPassword) {
          setInitialPassword(created.initialPassword);
        }
        if (!created?.id) onClose();
      } else {
        onClose();
      }
    },
    onError: () => toast.error('Erreur'),
  });

  const { register, handleSubmit, reset, control, setValue } = useForm<any>({
    // defaultValues garantit que `agencyId` est defini des le premier render
    // (sinon Controller render avec field.value=undefined puis reset n'est pas
    // toujours respectee par les sous-composants disabled -> formulaire bloque).
    defaultValues: { agencyId: defaultAgency?.id ?? '' },
  });

  // Catalogue des postes (Phase 1 ABAC) : remplace la saisie libre.
  const { data: positionsResp, isLoading: positionsLoading } = usePositions();
  const positionOptions = useMemo(
    () =>
      ((positionsResp as any)?.data ?? [])
        .filter((p: any) => p.isActive !== false)
        .map((p: any) => ({ value: p.id, label: p.name })),
    [positionsResp],
  );
  const onSubmit = (data: any) => {
    if (!data.agencyId) {
      toast.error('Agence manquante');
      return;
    }
    mutation.mutate({ ...data, baseSalary: Number(data.baseSalary || 0) });
  };

  // editableId : ID utilisable pour uploader les photos (employe.id en edition,
  // ou ID retourne par la creation).
  const [editableId, setEditableId] = useState<string | null>(null);
  const [initialPassword, setInitialPassword] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<Slot, string | null>>({
    selfie: null,
    locationPlan: null,
    idDocument: null,
    idDocumentBack: null,
  });
  const [busy, setBusy] = useState<Slot | null>(null);

  useEffect(() => {
    if (!open) return;
    if (employee) {
      reset({
        fullName: employee.fullName,
        agencyId: employee.agencyId,
        position: employee.position,
        positionId: employee.positionId ?? '',
        phone: employee.phone ?? '',
        emergencyContactName: (employee as any).emergencyContactName ?? '',
        emergencyContactPhone: (employee as any).emergencyContactPhone ?? '',
        emergencyContactRelation: (employee as any).emergencyContactRelation ?? '',
        idNumber: employee.idNumber ?? '',
        baseSalary: employee.baseSalary != null ? Number(employee.baseSalary) : undefined,
        educationLevel: employee.educationLevel ?? '',
        specialty: employee.specialty ?? '',
        contractType: employee.contractType ?? 'CDI',
        managerId: employee.managerId ?? '',
        isAgencyManager: !!employee.isAgencyManager,
      });
      setEditableId(employee.id);
      setPhotoUrls({
        selfie: employee.selfieUrl ?? null,
        locationPlan: employee.locationPlanUrl ?? null,
        idDocument: employee.idDocumentUrl ?? null,
        idDocumentBack: employee.idDocumentBackUrl ?? null,
      });
    } else {
      reset(defaultAgency ? { agencyId: defaultAgency.id, contractType: 'CDI', isAgencyManager: false } : { agencyId: '', contractType: 'CDI', isAgencyManager: false });
      // setValue garantit que la Controller agencyId voit la valeur meme si
      // disabled (le AppSearchSelect ne peut pas declencher onChange tout seul).
      if (defaultAgency?.id) setValue('agencyId', defaultAgency.id, { shouldValidate: true });
      setEditableId(null);
      setInitialPassword(null);
      setPhotoUrls({ selfie: null, locationPlan: null, idDocument: null, idDocumentBack: null });
    }
  }, [open, defaultAgency, employee, reset, setValue]);

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
  const slotKeys: Slot[] = useMemo(
    () => ['selfie', 'locationPlan', 'idDocument', 'idDocumentBack'],
    [],
  );

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
          <Controller
            name="positionId"
            control={control}
            rules={{ required: 'Poste obligatoire' }}
            render={({ field, fieldState }) => (
              <AppSelect
                label="Poste"
                placeholder={positionsLoading ? 'Chargement...' : 'Selectionner un poste'}
                options={positionOptions}
                value={field.value || ''}
                onValueChange={(v) => {
                  field.onChange(v);
                  // Synchronise le libelle "position" (legacy) avec le poste choisi
                  // pour que les usages existants (recherche, affichage liste) restent fonctionnels.
                  const opt = positionOptions.find((o: { value: string; label: string }) => o.value === v);
                  if (opt) setValue('position', opt.label, { shouldValidate: true });
                }}
                error={fieldState.error?.message}
              />
            )}
          />
          {/* Champ cache : libelle du poste, synchronise avec positionId (compat ascendante). */}
          <input type="hidden" {...register('position', { required: true })} />
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <AppPhoneInput label="Telephone" value={field.value} onChange={field.onChange} />
            )}
          />
          <AppInput
            label="Matricule"
            placeholder={isEdit ? '' : 'Auto-genere si laisse vide (ex: TRA-EMPL-2511231342)'}
            {...register('idNumber')}
          />
          <AppInput label="Email (pour compte portail)" type="email" {...register('email')} />
          <AppInput label="Salaire de base" type="number" {...register('baseSalary')} />
          <AppInput label="Niveau d'etudes" placeholder="Licence, Master, BAC+3..." {...register('educationLevel')} />
          <AppInput label="Specialite" placeholder="Logistique, Comptabilite..." {...register('specialty')} />
          <Controller
            name="contractType"
            control={control}
            render={({ field }) => (
              <AppSelect
                label="Type de contrat"
                options={CONTRACT_TYPE_OPTIONS}
                value={field.value || 'CDI'}
                onValueChange={field.onChange}
              />
            )}
          />
          <Controller
            name="managerId"
            control={control}
            render={({ field }) => (
              <AppSearchSelect
                label="Superieur hierarchique (optionnel)"
                value={field.value as string | null | undefined}
                onChange={(v) => field.onChange(v ?? '')}
                search={(q, limit) => searchers.employees(q, limit, defaultAgency?.id ? { agencyId: defaultAgency.id } : undefined)}
                placeholder="Aucun"
                clearable
              />
            )}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
            {...register('isAgencyManager')}
          />
          <span>
            Marquer comme <strong>Chef d&apos;agence</strong>
            <span className="block text-[11px] text-gray-500">
              Permet de valider les conges, sanctions et pointages des employes de cette agence.
            </span>
          </span>
        </label>

        {!isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              {...register('createUser')}
            />
            <span>
              Creer un <strong>compte portail</strong> pour cet employe (necessite un email)
              <span className="block text-[11px] text-gray-500">
                L&apos;employe pourra se connecter sur /login et acceder a son espace personnel
                (profil, conges, salaires). Un mot de passe initial sera genere et affiche apres creation.
              </span>
            </span>
          </label>
        )}

        <div className="rounded-xl border border-gray-100 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Contact d&apos;urgence (optionnel)
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppInput label="Nom" {...register('emergencyContactName')} placeholder="Nom complet" />
            <AppInput label="Lien" {...register('emergencyContactRelation')} placeholder="Conjoint, parent..." />
            <Controller
              name="emergencyContactPhone"
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

      {initialPassword && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Compte portail cree</p>
          <p className="mt-1 text-xs text-amber-800">
            Communiquez ces identifiants a l&apos;employe. Le mot de passe ne sera plus affiche apres
            fermeture de cette fenetre.
          </p>
          <div className="mt-2 flex items-center gap-3 rounded-lg bg-white px-3 py-2">
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Mot de passe initial</p>
              <p className="font-mono text-base font-bold">{initialPassword}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(initialPassword).then(
                  () => toast.success('Copie'),
                  () => toast.error('Copie impossible'),
                );
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50"
            >
              Copier
            </button>
          </div>
        </div>
      )}

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
