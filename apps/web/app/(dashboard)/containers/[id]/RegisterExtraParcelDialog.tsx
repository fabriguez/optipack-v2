'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSwitch } from '@/components/ui/AppSwitch';
import { searchers } from '@/lib/api/searchers';
import { apiClient } from '@/lib/api/client';
import { ParcelCategoryValues } from '@transitsoftservices/shared';
import { QRScannerDialog } from '@/components/shared/QRScannerDialog';
import { normalizeScannedTracking } from '@/lib/utils/scanNormalize';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  containerId: string;
  containerDesignation: string;
  /** Magasin par defaut : typiquement l'agence d'arrivee du conteneur. */
  defaultWarehouseId?: string | null;
}

interface FormValues {
  designation: string;
  weight: string;
  volume: string;
  category: string;
  isFragile: boolean;
  isHazardous: boolean;
  declaredValue: string;
  observation: string;
  trackingFournisseur: string;
  clientId: string;
  recipientId: string;
  warehouseId: string;
  destinationAgencyId: string;
  destinationAddress: string;
}

/**
 * Enregistre un colis trouve physiquement dans un conteneur receptionne mais
 * non present en ligne. Cree un vrai Parcel via /manifests/discrepancies/:id/
 * register-extra. Le colis apparaitra dans tous les listings + une discrepancy
 * EXTRA_PHYSICAL est creee pour audit.
 */
export function RegisterExtraParcelDialog({
  open,
  onClose,
  containerId,
  containerDesignation,
  defaultWarehouseId,
}: Props) {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  // Scanner local pour saisir rapidement le tracking fournisseur depuis
  // l'etiquette du colis non enregistre, sans avoir a le retaper.
  const [scannerOpen, setScannerOpen] = useState(false);
  const { register, handleSubmit, control, watch, reset, setValue, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      designation: '',
      weight: '',
      volume: '',
      category: 'STANDARD',
      isFragile: false,
      isHazardous: false,
      declaredValue: '',
      observation: '',
      trackingFournisseur: '',
      clientId: '',
      recipientId: '',
      warehouseId: defaultWarehouseId ?? '',
      destinationAgencyId: '',
      destinationAddress: '',
    },
  });

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      const payload = {
        designation: data.designation.trim(),
        weight: data.weight ? Number(data.weight) : null,
        volume: data.volume ? Number(data.volume) : null,
        category: data.category,
        isFragile: !!data.isFragile,
        isHazardous: !!data.isHazardous,
        declaredValue: data.declaredValue ? Number(data.declaredValue) : null,
        observation: data.observation.trim() || null,
        trackingFournisseur: data.trackingFournisseur.trim() || null,
        clientId: data.clientId,
        recipientId: data.recipientId || null,
        warehouseId: data.warehouseId,
        destinationAgencyId: data.destinationAgencyId || null,
        destinationAddress: data.destinationAddress.trim() || null,
      };
      const res = await apiClient.post(
        `/manifests/discrepancies/${containerId}/register-extra`,
        payload,
      );
      const created = res.data?.data;
      toast.success(`Colis enregistre : ${created?.trackingNumber ?? ''}`);
      // Invalide les caches concernes : comparaison, discrepancies, parcels du magasin, conteneur.
      qc.invalidateQueries({ queryKey: ['manifests', 'comparison', containerId] });
      qc.invalidateQueries({ queryKey: ['manifests', 'discrepancies', containerId] });
      qc.invalidateQueries({ queryKey: ['parcels'] });
      qc.invalidateQueries({ queryKey: ['containers', containerId] });
      reset();
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Echec de l'enregistrement");
    } finally {
      setSubmitting(false);
    }
  };

  const weightVal = watch('weight');
  const volumeVal = watch('volume');

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={`Enregistrer un colis trouve - ${containerDesignation}`}
      description="Le colis sera cree avec les details ci-dessous et lie a ce conteneur. Il apparaitra dans le bordereau de comparaison comme EXTRA_PHYSICAL."
      size="lg"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" form="register-extra-form" loading={submitting}>
            Enregistrer le colis
          </AppButton>
        </>
      }
    >
      <form id="register-extra-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AppInput
            label="Designation *"
            placeholder="Ex: Carton vetements"
            {...register('designation', { required: true })}
            error={errors.designation && 'Designation obligatoire'}
          />
          {/* Tracking fournisseur + bouton scan. Le QR / code-barres de
              l'etiquette est decode et pose directement dans le champ.
              `normalizeScannedTracking` retire les eventuels prefixes
              d'URL ("https://.../tracking/XYZ" -> "XYZ"). */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <AppInput
                label="Tracking fournisseur (optionnel)"
                placeholder="Code externe"
                {...register('trackingFournisseur')}
              />
            </div>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="mb-px flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
              title="Scanner l'etiquette fournisseur"
              aria-label="Scanner l'etiquette fournisseur"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>
          <AppInput label="Masse (kg)" type="number" step="0.0001" {...register('weight')} />
          <AppInput label="Volume (m3)" type="number" step="0.01" {...register('volume')} />
          {!weightVal && !volumeVal && (
            <p className="sm:col-span-2 text-xs text-amber-700">
              Renseignez au moins une masse OU un volume.
            </p>
          )}

          <Controller
            name="clientId"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <AppSearchSelect
                label="Client (proprietaire) *"
                value={field.value}
                onChange={(v) => field.onChange(v ?? '')}
                search={searchers.clients}
                placeholder="Selectionner un client"
                required
                error={errors.clientId && 'Client obligatoire'}
              />
            )}
          />
          <Controller
            name="recipientId"
            control={control}
            render={({ field }) => (
              <AppSearchSelect
                label="Destinataire (optionnel)"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
                search={searchers.recipients}
                placeholder="Selectionner ou laisser vide"
                clearable
              />
            )}
          />

          <Controller
            name="warehouseId"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <AppSearchSelect
                label="Magasin de stockage *"
                value={field.value}
                onChange={(v) => field.onChange(v ?? '')}
                search={searchers.warehouses}
                placeholder="Selectionner un magasin"
                required
                error={errors.warehouseId && 'Magasin obligatoire'}
              />
            )}
          />
          <Controller
            name="destinationAgencyId"
            control={control}
            render={({ field }) => (
              <AppSearchSelect
                label="Agence de destination (optionnel)"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
                search={searchers.agencies}
                placeholder="Agence d'arrivee par defaut"
                clearable
              />
            )}
          />
          <div className="sm:col-span-2">
            <AppInput
              label="Adresse de destination (optionnelle)"
              placeholder="Rue, quartier..."
              {...register('destinationAddress')}
            />
          </div>

          <Controller
            name="category"
            control={control}
            render={({ field }) => (
              <AppSelect
                label="Categorie"
                value={field.value}
                onValueChange={field.onChange}
                options={ParcelCategoryValues.map((v) => ({
                  value: v,
                  label: v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' '),
                }))}
              />
            )}
          />
          <AppInput
            label="Valeur declaree (XAF, optionnel)"
            type="number"
            placeholder="Pour assurance"
            {...register('declaredValue')}
          />

          <Controller
            name="isFragile"
            control={control}
            render={({ field }) => (
              <div className="flex items-center justify-between rounded-xl bg-orange-50 p-3">
                <div>
                  <p className="text-sm font-medium text-orange-900">Fragile</p>
                  <p className="text-xs text-orange-700">Manipulation prudente</p>
                </div>
                <AppSwitch checked={!!field.value} onCheckedChange={field.onChange} />
              </div>
            )}
          />
          <Controller
            name="isHazardous"
            control={control}
            render={({ field }) => (
              <div className="flex items-center justify-between rounded-xl bg-red-50 p-3">
                <div>
                  <p className="text-sm font-medium text-red-900">Dangereux</p>
                  <p className="text-xs text-red-700">Marchandise sensible</p>
                </div>
                <AppSwitch checked={!!field.value} onCheckedChange={field.onChange} />
              </div>
            )}
          />

          <div className="sm:col-span-2">
            <AppTextarea
              label="Observation"
              rows={3}
              placeholder="Notes sur ce colis trouve..."
              {...register('observation')}
            />
          </div>
        </div>
      </form>

      {/* Scanner overlay : ferme automatiquement apres detection
          (closeOnDetect par defaut) -- on n'enregistre qu'un seul
          tracking fournisseur par colis, contrairement aux flux batch. */}
      <QRScannerDialog
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(decoded) => {
          const v = normalizeScannedTracking(decoded);
          if (v) {
            setValue('trackingFournisseur', v, { shouldDirty: true });
            toast.success(`Tracking fournisseur : ${v}`);
          }
        }}
        title="Scanner l'etiquette fournisseur"
      />
    </AppDialog>
  );
}
