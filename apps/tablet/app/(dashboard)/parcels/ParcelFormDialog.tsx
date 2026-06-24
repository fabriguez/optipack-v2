import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { AppDialog, AppTextInput, AppSearchSelect, AppSelect, AppSwitch, ImageInput } from '@/components/forms';
import { Button } from '@/components/ui/Button';
import { ScannerDialog } from '@/components/data/ScannerDialog';
import { RecipientQuickCreateDialog } from './RecipientQuickCreateDialog';
import { useCreateParcel, useUpdateParcel } from '@/lib/hooks/useParcels';
import { parcelsApi } from '@/lib/api/parcels';
import { apiClient } from '@/lib/api/client';
import { downloadAndShare } from '@/lib/api/download';
import { searchers } from '@/lib/api/searchers';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const CATEGORIES = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'DOCUMENT', label: 'Document' },
  { value: 'FOOD', label: 'Alimentaire' },
  { value: 'ELECTRONICS', label: 'Electronique' },
  { value: 'CLOTHING', label: 'Vetements' },
  { value: 'OTHER', label: 'Autre' },
];

type Mode = 'weight' | 'volume' | 'both';

const schema = z.object({
  designation: z.string().min(2, 'Designation requise (min 2)'),
  trackingFournisseur: z.string().optional(),
  weight: z.string().optional(),
  volume: z.string().optional(),
  clientId: z.string().min(1, 'Client requis'),
  recipientId: z.string().optional(),
  warehouseId: z.string().min(1, 'Magasin requis'),
  transitRouteId: z.string().min(1, 'Route de transit requise'),
  destinationAgencyId: z.string().min(1, 'Agence de destination requise'),
  destinationAddress: z.string().optional(),
  category: z.string().optional(),
  declaredValue: z.string().optional(),
  isFragile: z.boolean().optional(),
  isHazardous: z.boolean().optional(),
  observation: z.string().optional(),
  images: z.any().optional(),
});
type FormValues = z.infer<typeof schema>;

interface ParcelLike {
  id: string;
  designation?: string;
  trackingFournisseur?: string | null;
  weight?: number | string | null;
  volume?: number | string | null;
  observation?: string | null;
  category?: string | null;
  declaredValue?: number | null;
  isFragile?: boolean;
  isHazardous?: boolean;
  destinationAddress?: string | null;
  destinationAgency?: { id: string; name: string } | null;
  client?: { id: string; fullName: string } | null;
  recipient?: { id: string; fullName: string } | null;
  warehouse?: { id: string; name: string } | null;
  transitRoute?: { id: string; name: string; type?: string } | null;
  status?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  parcel?: ParcelLike | null;
  defaultClient?: { id: string; fullName: string } | null;
  defaultWarehouse?: { id: string; name: string } | null;
  defaultTransitType?: 'AIR' | 'SEA' | 'LAND' | null;
}

async function uploadAsset(asset: { uri: string; name: string; mimeType: string }): Promise<string | null> {
  const fd = new FormData();
  fd.append('image', { uri: asset.uri, name: asset.name, type: asset.mimeType } as never);
  const r = await apiClient.post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  return r.data?.data?.url ?? null;
}

export function ParcelFormDialog({ open, onClose, parcel, defaultClient, defaultWarehouse, defaultTransitType }: Props) {
  const isEdit = !!parcel;
  const create = useCreateParcel();
  const update = useUpdateParcel();
  const [mode, setMode] = useState<Mode>('weight');
  const [showScanner, setShowScanner] = useState(false);
  const [showRecipientCreate, setShowRecipientCreate] = useState(false);
  const [recipientLabel, setRecipientLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { control, handleSubmit, reset, setValue, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { designation: '', clientId: '', warehouseId: '', transitRouteId: '', destinationAgencyId: '', category: 'STANDARD', isFragile: false, isHazardous: false },
  });

  useEffect(() => {
    if (!open) return;
    const initialMode: Mode = parcel
      ? parcel.weight && parcel.volume ? 'both' : parcel.volume ? 'volume' : 'weight'
      : defaultTransitType === 'SEA' ? 'volume' : defaultTransitType === 'LAND' ? 'both' : 'weight';
    setMode(initialMode);
    setRecipientLabel(parcel?.recipient?.fullName ?? '');
    reset({
      designation: parcel?.designation ?? '',
      trackingFournisseur: parcel?.trackingFournisseur ?? '',
      weight: parcel?.weight != null ? String(parcel.weight) : '',
      volume: parcel?.volume != null ? String(parcel.volume) : '',
      clientId: parcel?.client?.id ?? defaultClient?.id ?? '',
      recipientId: parcel?.recipient?.id ?? '',
      warehouseId: parcel?.warehouse?.id ?? defaultWarehouse?.id ?? '',
      transitRouteId: parcel?.transitRoute?.id ?? '',
      destinationAgencyId: parcel?.destinationAgency?.id ?? '',
      destinationAddress: parcel?.destinationAddress ?? '',
      category: parcel?.category ?? 'STANDARD',
      declaredValue: parcel?.declaredValue != null ? String(parcel.declaredValue) : '',
      isFragile: parcel?.isFragile ?? false,
      isHazardous: parcel?.isHazardous ?? false,
      observation: parcel?.observation ?? '',
      images: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-sync du mode selon le type de la route choisie.
  const routeId = watch('transitRouteId');
  const { data: routeData } = useQuery({
    queryKey: ['transit-routes', 'detail', routeId],
    queryFn: () => apiClient.get(`/transit-routes/${routeId}`).then((r) => r.data),
    enabled: !!routeId,
  });
  useEffect(() => {
    const type = (routeData?.data ?? routeData)?.type as string | undefined;
    if (!type) return;
    const next: Mode = type === 'AIR' ? 'weight' : type === 'SEA' ? 'volume' : 'both';
    setMode((prev) => {
      if (prev !== next) {
        if (next === 'weight') setValue('volume', '');
        if (next === 'volume') setValue('weight', '');
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeData]);

  const allowedTypes = defaultTransitType ?? (mode === 'weight' ? 'AIR,LAND' : mode === 'volume' ? 'SEA,LAND' : undefined);

  const submit = handleSubmit(async (v) => {
    const w = v.weight ? Number(v.weight) : undefined;
    const vol = v.volume ? Number(v.volume) : undefined;
    if (mode === 'weight' && !w) { toast.error('Masse obligatoire (route aerienne).'); return; }
    if (mode === 'volume' && !vol) { toast.error('Volume obligatoire (route maritime).'); return; }
    if (mode === 'both' && (!w || !vol)) { toast.error('Masse et volume obligatoires (route terrestre).'); return; }

    const images = v.images as { uri: string; name: string; mimeType: string }[] | null;
    const payload = {
      designation: v.designation,
      trackingFournisseur: v.trackingFournisseur || undefined,
      weight: mode === 'volume' ? undefined : w,
      volume: mode === 'weight' ? undefined : vol,
      clientId: v.clientId,
      recipientId: v.recipientId || undefined,
      warehouseId: v.warehouseId,
      transitRouteId: v.transitRouteId,
      destinationAgencyId: v.destinationAgencyId,
      destinationAddress: v.destinationAddress || undefined,
      category: v.category || 'STANDARD',
      declaredValue: v.declaredValue ? Number(String(v.declaredValue).replace(/[^\d.]/g, '')) : undefined,
      isFragile: !!v.isFragile,
      isHazardous: !!v.isHazardous,
      observation: v.observation || undefined,
    };

    setSubmitting(true);
    try {
      let parcelId = parcel?.id;
      let createdTracking: string | undefined;
      if (isEdit) await update.mutateAsync({ id: parcel!.id, data: payload as never });
      else {
        const res = await create.mutateAsync(payload as never);
        const created = (res?.data ?? res) as { id?: string; trackingNumber?: string } | undefined;
        parcelId = created?.id;
        createdTracking = created?.trackingNumber;
      }
      if (parcelId && Array.isArray(images) && images.length) {
        for (const img of images) {
          try { const url = await uploadAsset(img); if (url) await parcelsApi.addImage(parcelId, { url }); } catch { /* ignore */ }
        }
      }
      reset();
      onClose();
      // Telechargement / partage automatique de l'etiquette du nouveau colis
      // (best-effort : un echec ne doit pas casser le flux de creation).
      if (!isEdit && parcelId) {
        const fileName = `etiquette-${createdTracking ?? parcelId}`;
        downloadAndShare(`/parcels/${parcelId}/label`, fileName, 'pdf').catch(() => { /* ignore */ });
      }
    } finally {
      setSubmitting(false);
    }
  });

  const destDisabled = parcel?.status === 'RECEIVED';

  return (
    <AppDialog
      open={open}
      onClose={() => { reset(); onClose(); }}
      title={isEdit ? 'Modifier le colis' : 'Nouveau colis'}
      description="Le prix sera calcule automatiquement (route, tarif partenaire, fidelite). Une facture sera generee."
      width={760}
      footer={
        <>
          <Button variant="ghost" onPress={() => { reset(); onClose(); }}>Annuler</Button>
          <Button loading={submitting} onPress={submit}>{isEdit ? 'Enregistrer' : 'Creer'}</Button>
        </>
      }
    >
      <ImageInput control={control} name="images" label="Photos du colis" multiple />

      <AppTextInput control={control} name="designation" label="Designation" required />

      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <AppTextInput control={control} name="trackingFournisseur" label="Tracking fournisseur (optionnel)" autoCapitalize="characters" />
        </View>
        <Button variant="outline" onPress={() => setShowScanner(true)}>Scan</Button>
      </View>

      {/* Mode toggle */}
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[700] }}>Tarification</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {([['weight', 'Par masse'], ['volume', 'Par volume'], ['both', 'Les deux']] as const).map(([val, lbl]) => (
            <Pressable
              key={val}
              onPress={() => { setMode(val); if (val === 'weight') setValue('volume', ''); if (val === 'volume') setValue('weight', ''); }}
              style={{ paddingVertical: 8, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: mode === val ? colors.primary[400] : colors.gray[300], backgroundColor: mode === val ? colors.primary[50] : colors.white }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: mode === val ? colors.primary[700] : colors.gray[600] }}>{lbl}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        {(mode === 'weight' || mode === 'both') && (
          <View style={{ flex: 1 }}><AppTextInput control={control} name="weight" label="Masse (kg)" keyboardType="decimal-pad" required /></View>
        )}
        {(mode === 'volume' || mode === 'both') && (
          <View style={{ flex: 1 }}><AppTextInput control={control} name="volume" label="Volume (m³)" keyboardType="decimal-pad" required /></View>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <AppSearchSelect control={control} name="clientId" label="Client" required selectedLabel={parcel?.client?.fullName ?? defaultClient?.fullName} search={(q) => searchers.clients(q).then((i) => i.map((x) => ({ value: x.value, label: x.label })))} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppSearchSelect control={control} name="recipientId" label="Destinataire" selectedLabel={recipientLabel} search={(q) => searchers.recipients(q).then((i) => i.map((x) => ({ value: x.value, label: x.label })))} />
          <Pressable onPress={() => setShowRecipientCreate(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="add-circle-outline" size={14} color={colors.primary[600]} />
            <Text style={{ fontSize: 12, color: colors.primary[600] }}>Creer le destinataire</Text>
          </Pressable>
        </View>
      </View>

      <AppSearchSelect control={control} name="warehouseId" label="Magasin" required selectedLabel={parcel?.warehouse?.name ?? defaultWarehouse?.name} search={(q) => searchers.warehouses(q).then((i) => i.map((x) => ({ value: x.value, label: x.label })))} />

      <AppSearchSelect
        control={control}
        name="transitRouteId"
        label={`Route de transit${mode === 'weight' ? ' (Aerien ou Terrestre)' : mode === 'volume' ? ' (Maritime ou Terrestre)' : ''}`}
        required
        selectedLabel={parcel?.transitRoute?.name}
        search={(q) => searchers.transitRoutes(q, 20, allowedTypes ? { type: allowedTypes } : undefined).then((i) => i.map((x) => ({ value: x.value, label: x.label })))}
      />

      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <View style={{ flex: 1 }}>
          {destDisabled ? (
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[700] }}>Agence de destination</Text>
              <Text style={{ fontSize: 13, color: colors.gray[400] }}>{parcel?.destinationAgency?.name ?? '-'} (verrouille : colis receptionne)</Text>
            </View>
          ) : (
            <AppSearchSelect control={control} name="destinationAgencyId" label="Agence de destination" required selectedLabel={parcel?.destinationAgency?.name} search={(q) => searchers.agencies(q).then((i) => i.map((x) => ({ value: x.value, label: x.label })))} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <AppTextInput control={control} name="destinationAddress" label="Adresse precise (optionnel)" />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <View style={{ flex: 1 }}><AppSelect control={control} name="category" label="Categorie" options={CATEGORIES} /></View>
        <View style={{ flex: 1 }}><AppTextInput control={control} name="declaredValue" label="Valeur declaree (XAF, optionnel)" keyboardType="decimal-pad" /></View>
      </View>

      <AppSwitch control={control} name="isFragile" label="Fragile" hint="Manipulation prudente requise" />
      <AppSwitch control={control} name="isHazardous" label="Marchandise dangereuse" hint="Interdite en conteneur aerien" />

      <AppTextInput control={control} name="observation" label="Observation" multiline />

      <ScannerDialog open={showScanner} onClose={() => setShowScanner(false)} onDetected={(code) => setValue('trackingFournisseur', code)} title="Scanner le tracking fournisseur" />
      <RecipientQuickCreateDialog
        open={showRecipientCreate}
        onClose={() => setShowRecipientCreate(false)}
        onCreated={(id, name) => { setValue('recipientId', id); setRecipientLabel(name); }}
      />
    </AppDialog>
  );
}
