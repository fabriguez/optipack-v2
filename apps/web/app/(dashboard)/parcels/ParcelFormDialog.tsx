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
import { ClientQuickCreateDialog } from './ClientQuickCreateDialog';
import { QRScannerDialog } from '@/components/shared/QRScannerDialog';
import { scanSound } from '@/lib/utils/scanSound';
import { Camera } from 'lucide-react';
import { ParcelImagesField, persistParcelImages, type PendingImage } from './ParcelImagesField';
import { uploadImage } from '@/lib/api/uploads';
import { parcelsApi } from '@/lib/api/parcels';
import { apiClient } from '@/lib/api/client';
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
  status?: string;
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
  // Creation inline d'un expediteur (client) depuis le selecteur "Client".
  const [clientCreateOpen, setClientCreateOpen] = useState(false);
  const [clientCreateName, setClientCreateName] = useState('');
  const [clientCreatePromise, setClientCreatePromise] = useState<((opt: SearchOption | null) => void) | null>(null);
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

  // Auto-sync du mode de pesee avec le type de la route selectionnee :
  //   AIR  -> mode 'weight' (kg uniquement)
  //   SEA  -> mode 'volume' (m3 uniquement)
  //   LAND -> mode 'both' (libre)
  // Cela evite que l'utilisateur saisisse une masse pour une route SEA (le
  // backend rejette ou facture a 0). On clear aussi la valeur incompatible
  // pour ne pas envoyer un weight sur SEA.
  useEffect(() => {
    const t = selectedRoute?.sublabel as 'AIR' | 'SEA' | 'LAND' | undefined;
    if (!t) return;
    const nextMode: Mode = t === 'AIR' ? 'weight' : t === 'SEA' ? 'volume' : 'both';
    if (nextMode !== mode) {
      setMode(nextMode);
      if (nextMode === 'weight') setValue('volume', undefined as never);
      if (nextMode === 'volume') setValue('weight', undefined as never);
    }
    // mode/setValue sont stables, on ne reagit qu'au changement de route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoute?.sublabel]);

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
    // Selon le type de route, on force a null/undefined les champs non
    // pertinents avant envoi. La validation finale est faite cote backend
    // dans CreateParcelUseCase/UpdateParcelUseCase (qui a acces au type de
    // route via DB et peut imposer la regle stricte).
    if (mode === 'weight') data.volume = undefined;
    if (mode === 'volume') data.weight = undefined;
    if (mode === 'weight' && (data.weight == null || Number(data.weight) <= 0)) {
      toast.error('La masse est obligatoire pour une route aerienne.');
      return;
    }
    if (mode === 'volume' && (data.volume == null || Number(data.volume) <= 0)) {
      toast.error('Le volume est obligatoire pour une route maritime.');
      return;
    }
    if (mode === 'both' && (
      data.weight == null || Number(data.weight) <= 0 ||
      data.volume == null || Number(data.volume) <= 0
    )) {
      toast.error('Masse et volume obligatoires pour une route terrestre.');
      return;
    }

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
      // Telechargement automatique de l'etiquette PDF du/des colis cree(s).
      // Best-effort : un echec ne doit pas casser le flux de succes (toast / fermeture).
      void downloadCreatedLabels(created);
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
                  onClick={() => {
                    setMode(m);
                    // Si la route courante n'est plus compatible avec le
                    // nouveau mode, on la deselectionne pour forcer un
                    // nouveau choix. AIR incompatible avec volume, SEA
                    // incompatible avec weight.
                    const t = selectedRoute?.sublabel;
                    if (
                      (m === 'weight' && t === 'SEA') ||
                      (m === 'volume' && t === 'AIR')
                    ) {
                      setSelectedRoute(null);
                      setValue('transitRouteId', '' as never);
                    }
                  }}
                  className={`rounded-lg px-3 py-1.5 ${mode === m ? 'bg-primary-500 text-white' : 'text-gray-500'}`}
                >
                  {m === 'weight' ? 'Par masse' : m === 'volume' ? 'Par volume' : 'Les deux'}
                </button>
              ))}
            </div>
            {selectedRoute && (
              <p className="text-[11px] text-primary-700">
                Route {selectedRoute.sublabel} : {mode === 'weight' ? 'masse obligatoire' : mode === 'volume' ? 'volume obligatoire' : 'masse + volume obligatoires'}.
              </p>
            )}
          </div>

          {(mode === 'weight' || mode === 'both') && (
            <AppInput
              label="Masse (kg) *"
              type="number"
              step="0.0001"
              {...register('weight', { valueAsNumber: true })}
              error={(errors.weight as any)?.message}
            />
          )}
          {(mode === 'volume' || mode === 'both') && (
            <AppInput
              label="Volume (m3) *"
              type="number"
              step="0.01"
              {...register('volume', { valueAsNumber: true })}
              error={(errors.volume as any)?.message}
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
                placeholder="Selectionner ou creer un client"
                createLabel="Creer le client"
                onCreate={(query) =>
                  new Promise<SearchOption | null>((resolve) => {
                    setClientCreateName(query);
                    setClientCreatePromise(() => resolve);
                    setClientCreateOpen(true);
                  })
                }
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
            render={({ field }) => {
              // Le mode de quantification limite les routes eligibles :
              //   weight  -> AIR + LAND (pas de SEA en kg)
              //   volume  -> SEA + LAND
              //   both    -> toutes
              // Le `defaultTransitType` (depuis un conteneur d'origine) reste
              // prioritaire si fourni : il epingle un seul type.
              const allowedTypes = defaultTransitType
                ? defaultTransitType
                : mode === 'weight'
                  ? 'AIR,LAND'
                  : mode === 'volume'
                    ? 'SEA,LAND'
                    : undefined;
              return (
                <AppSearchSelect
                  label={
                    defaultTransitType
                      ? `Route de transit (${typeLabel(defaultTransitType)})`
                      : mode === 'weight'
                        ? 'Route de transit (Aerien ou Terrestre)'
                        : mode === 'volume'
                          ? 'Route de transit (Maritime ou Terrestre)'
                          : 'Route de transit'
                  }
                  // Cle de cache incluant le filtre courant : sinon React
                  // Query rejoue le meme cache pour deux filtres differents.
                  searchKey={`searchers.transitRoutes.${allowedTypes ?? 'all'}`}
                  value={field.value}
                  onChange={(v) => field.onChange(v ?? '')}
                  search={(q, l) =>
                    searchers.transitRoutes(q, l, allowedTypes ? { type: allowedTypes } : undefined)
                  }
                  selectedOption={selectedRoute}
                  error={errors.transitRouteId?.message}
                  required
                  placeholder="Selectionner une route"
                />
              );
            }}
          />

          {/* Agence de destination : obligatoire. La ville d'arrivee (champ
              "destination" historique) est derivee automatiquement cote backend. */}
          <Controller
            control={control}
            name="destinationAgencyId"
            render={({ field }) => (
              <div>
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
                  disabled={parcel?.status === 'RECEIVED'}
                  placeholder="Selectionner l'agence d'arrivee"
                />
                {parcel?.status === 'RECEIVED' && (
                  <p className="mt-1 text-xs text-amber-700">
                    Colis deja receptionne : la destination n&apos;est plus modifiable.
                  </p>
                )}
              </div>
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
            // type=text + inputMode=decimal : champ totalement libre, le mobile
            // ouvre un clavier numerique mais accepte aussi des caracteres
            // (espaces, "XAF", ~). On extrait les chiffres et la virgule cote
            // setValueAs pour produire un number ou null sans bloquer la saisie.
            type="text"
            inputMode="decimal"
            placeholder="Optionnel - pour assurance"
            {...register('declaredValue', {
              setValueAs: (v: unknown) => {
                if (v === '' || v == null) return null;
                const s = String(v).replace(/[^\d.,-]/g, '').replace(',', '.');
                if (!s) return null;
                const n = Number(s);
                return Number.isFinite(n) && n >= 0 ? n : null;
              },
            })}
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

      <ClientQuickCreateDialog
        open={recipientCreateOpen}
        entityLabel="destinataire"
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

      <ClientQuickCreateDialog
        open={clientCreateOpen}
        entityLabel="client"
        initialName={clientCreateName}
        onClose={() => {
          if (clientCreatePromise) clientCreatePromise(null);
          setClientCreatePromise(null);
          setClientCreateOpen(false);
        }}
        onCreated={(opt) => {
          if (clientCreatePromise) clientCreatePromise(opt);
          setSelectedClient(opt);
          setClientCreatePromise(null);
          setClientCreateOpen(false);
        }}
      />

      <QRScannerDialog
        open={scanFournisseurOpen}
        onClose={() => setScanFournisseurOpen(false)}
        onDetected={(decoded) => {
          // Tracking fournisseur : pas de validation cote systeme (le code vient
          // d'un partenaire externe), donc tout scan est un succes franc.
          scanSound.success();
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

/**
 * Telecharge l'etiquette PDF d'un colis (memes appels que ParcelQRDialog :
 * apiClient.get('/parcels/:id/label', { responseType: 'blob' }) puis save du blob).
 * Best-effort : toute erreur est avalee (ne doit pas casser le flux de creation).
 */
async function downloadParcelLabel(id: string, trackingNumber?: string | null): Promise<void> {
  try {
    const res = await apiClient.get(`/parcels/${id}/label`, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etiquette-${trackingNumber || id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // Silencieux : echec de telechargement non bloquant.
  }
}

/**
 * Extrait le(s) colis cree(s) de la reponse de creation (colis unique OU lot)
 * et declenche le telechargement de chaque etiquette.
 */
async function downloadCreatedLabels(created: unknown): Promise<void> {
  const payload = (created as any)?.data ?? created;
  const list: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.parcels)
      ? payload.parcels
      : payload
        ? [payload]
        : [];
  for (const p of list) {
    if (p?.id) await downloadParcelLabel(p.id, p.trackingNumber);
  }
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
