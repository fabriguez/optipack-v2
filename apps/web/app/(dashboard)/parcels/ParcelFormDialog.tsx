'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createParcelSchema, type CreateParcelInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchSelect, type SearchOption } from '@/components/ui/AppSearchSelect';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSwitch } from '@/components/ui/AppSwitch';
import { useCreateParcel, useUpdateParcel } from '@/lib/hooks/useParcels';
import { searchers, toSearchOption } from '@/lib/api/searchers';
import { ParcelCategoryValues } from '@transitsoftservices/shared';
import { RecipientQuickCreateDialog } from './RecipientQuickCreateDialog';
import { QRScannerDialog } from '@/components/shared/QRScannerDialog';
import { Camera } from 'lucide-react';
import { ParcelImagesField, persistParcelImages, type PendingImage } from './ParcelImagesField';
import { uploadImage } from '@/lib/api/uploads';
import { parcelsApi } from '@/lib/api/parcels';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ParcelLike {
  id: string;
  designation: string;
  trackingFournisseur?: string | null;
  destinationAgencyId?: string | null;
  destinationAddress?: string | null;
  destinationAgency?: { id: string; name: string; city?: string | null } | null;
  weight?: number | string | null;
  volume?: number | string | null;
  observation?: string | null;
  client?: { id: string; fullName: string; phone?: string };
  recipient?: { id: string; fullName: string; phone?: string } | null;
  warehouse?: { id: string; name: string; agency?: { name: string } } | null;
  transitRoute?: { id: string; name: string; type?: string } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  parcel?: ParcelLike | null; // si fourni : mode edition
  /** Pre-selection (lock) du magasin — utilise depuis la page detail magasin */
  defaultWarehouse?: { id: string; name: string; agency?: { name?: string | null } | null } | null;
  /** Pre-selection (lock) du client — utilise depuis la page detail client */
  defaultClient?: { id: string; fullName: string; phone?: string | null } | null;
  /** Restreint la recherche de routes au type donne (utilise depuis le chargement d'un conteneur) */
  defaultTransitType?: 'AIR' | 'SEA' | 'LAND' | null;
}

type Mode = 'weight' | 'volume' | 'both';

export function ParcelFormDialog({ open, onClose, parcel, defaultWarehouse, defaultClient, defaultTransitType }: Props) {
  const isEdit = !!parcel;
  const createMutation = useCreateParcel();
  const updateMutation = useUpdateParcel();
  const qc = useQueryClient();

  const [selectedClient, setSelectedClient] = useState<SearchOption | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState<SearchOption | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<SearchOption | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<SearchOption | null>(null);
  const [selectedDestAgency, setSelectedDestAgency] = useState<SearchOption | null>(null);
  // Scan QR pour pre-remplir le tracking fournisseur (numero de colis externe).
  const [scanFournisseurOpen, setScanFournisseurOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('weight');
  const [recipientCreateOpen, setRecipientCreateOpen] = useState(false);
  const [recipientCreateName, setRecipientCreateName] = useState('');
  const [recipientCreatePromise, setRecipientCreatePromise] = useState<((opt: SearchOption | null) => void) | null>(null);
  // Images : pending = nouveaux fichiers a uploader apres save ; removed = images
  // existantes a supprimer apres save.
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<CreateParcelInput>({
    resolver: zodResolver(createParcelSchema),
  });

  const weight = watch('weight');
  const volume = watch('volume');

  useEffect(() => {
    if (!open) return;
    // Reset etat images a chaque ouverture (et cleanup des previews precedentes).
    pendingImages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPendingImages([]);
    setRemovedImageIds([]);

    if (parcel) {
      reset({
        designation: parcel.designation,
        trackingFournisseur: parcel.trackingFournisseur || '',
        destinationAgencyId: parcel.destinationAgencyId ?? parcel.destinationAgency?.id ?? '',
        destinationAddress: parcel.destinationAddress ?? '',
        weight: parcel.weight ? Number(parcel.weight) : undefined,
        volume: parcel.volume ? Number(parcel.volume) : undefined,
        observation: parcel.observation || '',
        clientId: parcel.client?.id ?? '',
        recipientId: parcel.recipient?.id,
        warehouseId: parcel.warehouse?.id ?? '',
        transitRouteId: parcel.transitRoute?.id ?? '',
      });
      if (parcel.client) setSelectedClient(toSearchOption.client(parcel.client));
      if (parcel.recipient) setSelectedRecipient(toSearchOption.client(parcel.recipient));
      if (parcel.warehouse) setSelectedWarehouse(toSearchOption.warehouse(parcel.warehouse));
      if (parcel.transitRoute) {
        setSelectedRoute({
          value: parcel.transitRoute.id,
          label: parcel.transitRoute.name,
          sublabel: parcel.transitRoute.type ?? null,
        });
      }
      if (parcel.destinationAgency) {
        setSelectedDestAgency({
          value: parcel.destinationAgency.id,
          label: parcel.destinationAgency.name,
          sublabel: parcel.destinationAgency.city ?? null,
        });
      } else {
        setSelectedDestAgency(null);
      }
      const hasW = parcel.weight !== null && parcel.weight !== undefined && Number(parcel.weight) > 0;
      const hasV = parcel.volume !== null && parcel.volume !== undefined && Number(parcel.volume) > 0;
      setMode(hasW && hasV ? 'both' : hasV ? 'volume' : 'weight');
    } else {
      const initial: Partial<CreateParcelInput> = {};
      if (defaultWarehouse) initial.warehouseId = defaultWarehouse.id;
      if (defaultClient) initial.clientId = defaultClient.id;
      reset(initial as CreateParcelInput);
      setSelectedClient(defaultClient ? toSearchOption.client(defaultClient) : null);
      setSelectedRecipient(null);
      setSelectedWarehouse(defaultWarehouse ? toSearchOption.warehouse(defaultWarehouse) : null);
      setSelectedRoute(null);
      setSelectedDestAgency(null);
      setMode('weight');
    }
  }, [open, parcel, reset, defaultWarehouse, defaultClient]);

  const onSubmit = async (data: CreateParcelInput) => {
    if (mode === 'weight') data.volume = undefined;
    if (mode === 'volume') data.weight = undefined;

    // 1ere requete : create / update du colis. On recupere son id (pour l'upload).
    let parcelId: string | null = null;
    if (isEdit && parcel) {
      await updateMutation.mutateAsync({
        id: parcel.id,
        data: {
          designation: data.designation,
          trackingFournisseur: data.trackingFournisseur || null,
          destinationAgencyId: data.destinationAgencyId,
          destinationAddress: data.destinationAddress || null,
          weight: mode === 'volume' ? null : data.weight,
          volume: mode === 'weight' ? null : data.volume,
          observation: data.observation || null,
          recipientId: data.recipientId ?? null,
          warehouseId: data.warehouseId,
          transitRouteId: data.transitRouteId,
        },
      });
      parcelId = parcel.id;
    } else {
      const created = await createMutation.mutateAsync(data);
      parcelId = (created as any)?.data?.id ?? (created as any)?.id ?? null;
    }

    // 2eme partie : upload des nouvelles images + suppression des images marquees.
    // Erreurs isolees (n'annulent pas la creation/edition du colis).
    if (parcelId && (pendingImages.length > 0 || removedImageIds.length > 0)) {
      setUploadingImages(true);
      try {
        const result = await persistParcelImages(
          parcelId,
          pendingImages,
          removedImageIds,
          uploadImage,
          (id, payload) => parcelsApi.addImage(id, payload),
          (id, imgId) => parcelsApi.removeImage(id, imgId),
        );
        if (result.errors.length > 0) {
          toast.error(`Images : ${result.errors.length} erreur(s). ${result.errors[0]}`);
        }
        if (result.added > 0 || result.removed > 0) {
          qc.invalidateQueries({ queryKey: ['parcels', parcelId, 'images'] });
        }
      } finally {
        setUploadingImages(false);
      }
    }

    reset();
    setPendingImages([]);
    setRemovedImageIds([]);
    onClose();
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier le colis' : 'Nouveau colis'}
      size="lg"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton
            type="submit"
            form="parcel-form"
            loading={createMutation.isPending || updateMutation.isPending || uploadingImages}
          >
            {uploadingImages
              ? 'Upload des images...'
              : isEdit
                ? 'Enregistrer les modifications'
                : 'Enregistrer le colis'}
          </AppButton>
        </>
      }
    >
      <form id="parcel-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppInput label="Designation" {...register('designation')} error={errors.designation?.message} />

          {/* Tracking fournisseur : code de suivi communique par le fournisseur
              externe (Aliexpress, DHL, etc). Bouton camera pour scanner directement
              le QR / code-barres. */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <AppInput
                label="Tracking fournisseur (optionnel)"
                placeholder="Code de suivi du fournisseur"
                {...register('trackingFournisseur')}
                error={(errors as any).trackingFournisseur?.message}
              />
            </div>
            <button
              type="button"
              onClick={() => setScanFournisseurOpen(true)}
              className="mb-px flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
              title="Scanner le code"
              aria-label="Scanner le code"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>

          <div className="sm:col-span-2">
            <div className="mb-2 inline-flex rounded-xl border border-gray-200 p-0.5 text-xs">
              {(['weight', 'volume', 'both'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-lg px-3 py-1.5 ${mode === m ? 'bg-primary-500 text-white' : 'text-gray-500'}`}
                >
                  {m === 'weight' ? 'Par masse' : m === 'volume' ? 'Par volume' : 'Les deux'}
                </button>
              ))}
            </div>
          </div>

          {(mode === 'weight' || mode === 'both') && (
            <AppInput
              label="Masse (kg)"
              type="number"
              step="0.1"
              {...register('weight', { valueAsNumber: true })}
              error={errors.weight?.message}
            />
          )}
          {(mode === 'volume' || mode === 'both') && (
            <AppInput
              label="Volume (m3)"
              type="number"
              step="0.01"
              {...register('volume', { valueAsNumber: true })}
              error={errors.volume?.message}
            />
          )}

          <Controller
            control={control}
            name="clientId"
            render={({ field }) => (
              <AppSearchSelect
                label="Client"
                value={field.value}
                onChange={(v) => {
                  field.onChange(v);
                  if (!v) setSelectedClient(null);
                }}
                search={searchers.clients}
                selectedOption={selectedClient}
                error={errors.clientId?.message}
                required
                disabled={!!defaultClient}
                placeholder="Selectionner un client"
              />
            )}
          />

          <Controller
            control={control}
            name="recipientId"
            render={({ field }) => (
              <AppSearchSelect
                label="Destinataire"
                value={field.value || null}
                onChange={(v) => {
                  field.onChange(v ?? undefined);
                  if (!v) setSelectedRecipient(null);
                }}
                search={searchers.recipients}
                selectedOption={selectedRecipient}
                placeholder="Selectionner ou creer un destinataire"
                createLabel="Creer le destinataire"
                onCreate={(query) =>
                  new Promise<SearchOption | null>((resolve) => {
                    setRecipientCreateName(query);
                    setRecipientCreatePromise(() => resolve);
                    setRecipientCreateOpen(true);
                  })
                }
              />
            )}
          />

          <Controller
            control={control}
            name="warehouseId"
            render={({ field }) => (
              <AppSearchSelect
                label="Magasin"
                value={field.value}
                onChange={(v) => field.onChange(v ?? '')}
                search={searchers.warehouses}
                selectedOption={selectedWarehouse}
                error={errors.warehouseId?.message}
                required
                disabled={!!defaultWarehouse}
                placeholder="Selectionner un magasin"
              />
            )}
          />

          <Controller
            control={control}
            name="transitRouteId"
            render={({ field }) => (
              <AppSearchSelect
                label={defaultTransitType ? `Route de transit (${typeLabel(defaultTransitType)})` : 'Route de transit'}
                value={field.value}
                onChange={(v) => field.onChange(v ?? '')}
                search={(q, l) => searchers.transitRoutes(q, l, defaultTransitType ? { type: defaultTransitType } : undefined)}
                selectedOption={selectedRoute}
                error={errors.transitRouteId?.message}
                required
                placeholder="Selectionner une route"
              />
            )}
          />

          {/* Agence de destination : obligatoire. La ville d'arrivee (champ
              "destination" historique) est derivee automatiquement cote backend. */}
          <Controller
            control={control}
            name="destinationAgencyId"
            render={({ field }) => (
              <AppSearchSelect
                label="Agence de destination"
                value={field.value || null}
                onChange={(v) => {
                  field.onChange(v ?? '');
                  if (!v) setSelectedDestAgency(null);
                }}
                search={searchers.agencies}
                selectedOption={selectedDestAgency}
                error={(errors as any).destinationAgencyId?.message}
                required
                placeholder="Selectionner l'agence d'arrivee"
              />
            )}
          />
          <AppInput
            label="Adresse precise (optionnel)"
            placeholder="Quartier, rue, point de repere..."
            {...register('destinationAddress')}
          />

          {/* Audit fix #10 : categorie + flags */}
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <AppSelect
                label="Categorie"
                value={field.value || 'STANDARD'}
                onValueChange={(v) => field.onChange(v)}
                options={ParcelCategoryValues.map((v) => ({ value: v, label: categoryLabel(v) }))}
              />
            )}
          />
          <AppInput
            label="Valeur declaree (XAF, optionnel)"
            type="number"
            step="100"
            placeholder="Pour assurance"
            {...register('declaredValue', { valueAsNumber: true })}
          />

          <Controller
            control={control}
            name="isFragile"
            render={({ field }) => (
              <div className="flex items-center justify-between rounded-xl bg-orange-50 p-3">
                <div>
                  <p className="text-sm font-medium text-orange-900">Fragile</p>
                  <p className="text-xs text-orange-700">Manipulation prudente requise</p>
                </div>
                <AppSwitch checked={!!field.value} onCheckedChange={field.onChange} />
              </div>
            )}
          />
          <Controller
            control={control}
            name="isHazardous"
            render={({ field }) => (
              <div className="flex items-center justify-between rounded-xl bg-red-50 p-3">
                <div>
                  <p className="text-sm font-medium text-red-900">Marchandise dangereuse</p>
                  <p className="text-xs text-red-700">Interdite en conteneur aerien</p>
                </div>
                <AppSwitch checked={!!field.value} onCheckedChange={field.onChange} />
              </div>
            )}
          />

          <AppTextarea
            label="Observation"
            rows={3}
            placeholder="Notes sur le colis (optionnel)"
            wrapperClassName="sm:col-span-2"
            {...register('observation')}
          />
        </div>

        {/* Photos du colis : geree dans le formulaire, uploadee apres save. */}
        <ParcelImagesField
          parcelId={parcel?.id ?? null}
          pending={pendingImages}
          onPendingChange={setPendingImages}
          removed={removedImageIds}
          onRemovedChange={setRemovedImageIds}
        />

        {!isEdit && (
          <div className="rounded-xl bg-primary-50 p-4 text-sm text-primary-800">
            Le prix sera calcule automatiquement selon la route, la tarification partenaire (si applicable) et le palier de fidelite.
            Une facture sera generee automatiquement.
          </div>
        )}

      </form>

      <RecipientQuickCreateDialog
        open={recipientCreateOpen}
        initialName={recipientCreateName}
        onClose={() => {
          if (recipientCreatePromise) recipientCreatePromise(null);
          setRecipientCreatePromise(null);
          setRecipientCreateOpen(false);
        }}
        onCreated={(opt) => {
          if (recipientCreatePromise) recipientCreatePromise(opt);
          setSelectedRecipient(opt);
          setRecipientCreatePromise(null);
          setRecipientCreateOpen(false);
        }}
      />

      <QRScannerDialog
        open={scanFournisseurOpen}
        onClose={() => setScanFournisseurOpen(false)}
        onDetected={(decoded) => {
          setValue('trackingFournisseur', decoded, { shouldDirty: true, shouldValidate: true });
          setScanFournisseurOpen(false);
        }}
        title="Scanner le code fournisseur"
      />
    </AppDialog>
  );
}

function typeLabel(t: 'AIR' | 'SEA' | 'LAND'): string {
  return t === 'AIR' ? 'Aerien' : t === 'SEA' ? 'Maritime' : 'Terrestre';
}

function categoryLabel(v: string): string {
  switch (v) {
    case 'STANDARD':
      return 'Standard';
    case 'DOCUMENT':
      return 'Document';
    case 'FOOD':
      return 'Alimentaire';
    case 'ELECTRONICS':
      return 'Electronique';
    case 'CLOTHING':
      return 'Vetements';
    case 'OTHER':
      return 'Autre';
    default:
      return v;
  }
}
