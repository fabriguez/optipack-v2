import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { formatAmount, formatDate, formatDateTime } from '@transitsoftservices/shared';
import { AppTabs, type TabItem } from '@/components/ui/AppTabs';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { HeaderAction } from '@/components/data/PageHeader';
import { SectionCard, EmptyState } from '@/components/data/DetailCards';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { resolveTabletImageUrl } from '@/components/shared/AgencyAvatar';
import { useParcel, useParcelHistory, useParcelImages, useAddParcelImage, useRemoveParcelImage } from '@/lib/hooks/useParcels';
import { apiClient } from '@/lib/api/client';
import { storage, STORAGE_KEYS } from '@/lib/storage/storage';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { ParcelFormDialog } from './ParcelFormDialog';

const STEPS = [
  { v: 'IN_STOCK', l: 'En stock' }, { v: 'LOADING', l: 'Chargement' }, { v: 'IN_TRANSIT', l: 'En transit' },
  { v: 'ARRIVED', l: 'Arrive' }, { v: 'RECEIVED', l: 'Recu' }, { v: 'DELIVERED', l: 'Livre' },
];
const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'info' | 'error'> = {
  IN_STOCK: 'default', LOADING: 'info', IN_TRANSIT: 'warning', ARRIVED: 'info', RECEIVED: 'info', DELIVERED: 'success', LOST: 'error',
};
const ic = (n: keyof typeof Ionicons.glyphMap) => <Ionicons name={n} size={15} color={colors.gray[500]} />;

function Row({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string | null }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
      <Ionicons name={icon} size={16} color={colors.gray[400]} />
      <Text style={{ fontSize: 13, color: colors.gray[500], width: 120 }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: colors.gray[900], fontWeight: '500', textAlign: 'right' }}>{value || '-'}</Text>
    </View>
  );
}

export default function ParcelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const parcelId = String(id);
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useParcel(parcelId);
  const [showEdit, setShowEdit] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tabKey, setTabKey] = useState(0);
  useFocusEffect(useCallback(() => { setTabKey((k) => k + 1); }, []));

  const p = data?.data;
  const onRefresh = async () => { setRefreshing(true); try { await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ['parcels', parcelId] })]); } finally { setRefreshing(false); } };

  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!p) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Colis introuvable</Text></View>;

  const stepIdx = STEPS.findIndex((s) => s.v === p.status);

  const tabs: TabItem[] = [
    { value: 'info', label: 'Informations', icon: ic('information-circle-outline'), content: <InfoTab parcel={p} /> },
    { value: 'images', label: 'Images', icon: ic('images-outline'), content: <ImagesTab parcelId={parcelId} /> },
    { value: 'history', label: 'Historique', icon: ic('time-outline'), content: <HistoryTab parcelId={parcelId} /> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
            <Pressable onPress={() => router.navigate('/parcels')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>{p.designation}</Text>
                <Badge variant={STATUS_VARIANT[p.status] ?? 'default'}>{p.status}</Badge>
              </View>
              <Text style={{ fontFamily: 'monospace', fontSize: 12, color: colors.primary[700], marginTop: 2 }}>{p.trackingNumber}</Text>
            </View>
          </View>
          <HeaderAction label="Modifier" icon="create-outline" variant="outline" onPress={() => setShowEdit(true)} />
        </View>

        {/* Stepper */}
        {p.status !== 'LOST' && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {STEPS.map((s, i) => (
              <View key={s.v} style={{ flex: 1, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
                  <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : i <= stepIdx ? colors.primary[500] : colors.gray[200] }} />
                  <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: i <= stepIdx ? colors.primary[500] : colors.gray[200] }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: i <= stepIdx ? colors.white : colors.gray[500] }}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1, height: 2, backgroundColor: i === STEPS.length - 1 ? 'transparent' : i < stepIdx ? colors.primary[500] : colors.gray[200] }} />
                </View>
                <Text style={{ fontSize: 10, color: i <= stepIdx ? colors.primary[700] : colors.gray[400], marginTop: 4 }}>{s.l}</Text>
              </View>
            ))}
          </View>
        )}

        <AppTabs key={tabKey} tabs={tabs} />
      </ScrollView>

      <ParcelFormDialog open={showEdit} onClose={() => setShowEdit(false)} parcel={p} />
    </View>
  );
}

function InfoTab({ parcel: p }: { parcel: any }) {
  const router = useRouter();
  const { data: feeData } = useQuery({ queryKey: ['parcels', p.id, 'storage-fee'], queryFn: () => apiClient.get(`/parcels/${p.id}/storage-fee`).then((r) => r.data), enabled: !!p.id });
  const fee = feeData?.data ?? feeData;
  const pesee = [p.weight ? `${p.weight} kg` : '', p.volume ? `${p.volume} m³` : ''].filter(Boolean).join(' · ') || '-';

  return (
    <View style={{ gap: spacing.xl }}>
      <SectionCard title="Informations du colis">
        <Row icon="cube-outline" label="Designation" value={p.designation} />
        <Row icon="barbell-outline" label="Pesee" value={pesee} />
        <Row icon="business-outline" label="Agence de depart" value={p.warehouse?.agency?.name ?? p.origin} />
        <Row icon="location-outline" label="Agence d'arrivee" value={p.destinationAgency?.name ?? p.destination} />
        <Row icon="person-outline" label="Client" value={p.client?.fullName} />
        <Row icon="person-outline" label="Destinataire" value={p.recipient?.fullName} />
        <Row icon="business-outline" label="Magasin" value={p.warehouse?.name} />
        <Row icon="git-network-outline" label="Route" value={p.transitRoute?.name} />
        <Row icon="pricetag-outline" label="Categorie" value={p.category} />
        <Row icon="cash-outline" label="Prix" value={formatAmount(Number(p.price ?? 0))} />
        <Row icon="calendar-outline" label="Enregistre le" value={p.createdAt ? formatDate(p.createdAt) : '-'} />
        {!!p.observation && (
          <View style={{ backgroundColor: colors.gray[50], borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md }}>
            <Text style={{ fontSize: 13, color: colors.gray[600] }}>{p.observation}</Text>
          </View>
        )}
      </SectionCard>

      {p.invoice && (
        <SectionCard title="Facture" action={<Button size="sm" variant="outline" onPress={() => router.push(`/invoices/${p.invoice.id}`)}>Voir</Button>}>
          <Row icon="document-text-outline" label="Reference" value={p.invoice.reference} />
          <Row icon="cash-outline" label="Montant" value={formatAmount(Number(p.price ?? 0))} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
            <Text style={{ fontSize: 13, color: colors.gray[500] }}>Statut</Text>
            <Badge variant={(p.invoice.effectiveStatus ?? p.invoice.status) === 'PAID' ? 'success' : 'warning'}>{p.invoice.effectiveStatus ?? p.invoice.status}</Badge>
          </View>
        </SectionCard>
      )}

      {p.container && (
        <SectionCard title="Conteneur" action={<Button size="sm" variant="outline" onPress={() => router.push(`/containers/${p.container.id}`)}>Voir</Button>}>
          <Row icon="cube-outline" label="Designation" value={p.container.designation} />
        </SectionCard>
      )}

      {fee?.applicable && (
        <SectionCard title="Frais de magasinage" subtitle={fee.warehouseName ?? undefined}>
          <Row icon="cash-outline" label="Total a facturer" value={formatAmount(Number(fee.totalFee ?? 0))} />
          <Row icon="calendar-outline" label="Entree en magasin" value={fee.enteredAt ? formatDate(fee.enteredAt) : '-'} />
          <Row icon="time-outline" label="Jours en stock" value={String(fee.daysInWarehouse ?? 0)} />
          <Row icon="gift-outline" label="Jours gratuits" value={String(fee.freeDays ?? 0)} />
          <Row icon="receipt-outline" label="Jours factures" value={String(fee.chargeableDays ?? 0)} />
          <Row icon="pricetag-outline" label="Tarif / jour" value={formatAmount(Number(fee.dailyRate ?? 0))} />
        </SectionCard>
      )}
    </View>
  );
}

function useToken() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => { storage.get<string>(STORAGE_KEYS.accessToken).then((v) => setT(v ?? null)); }, []);
  return t;
}

function ImagesTab({ parcelId }: { parcelId: string }) {
  const { data } = useParcelImages(parcelId);
  const add = useAddParcelImage(parcelId);
  const remove = useRemoveParcelImage(parcelId);
  const token = useToken();
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const images: any[] = data?.data ?? [];

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', { uri: a.uri, name: a.fileName ?? `img-${Date.now()}.jpg`, type: a.mimeType ?? 'image/jpeg' } as never);
      const up = await apiClient.post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
      const url = up?.data?.url ?? up?.url;
      if (url) await add.mutateAsync({ url });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title={`Galerie (${images.length})`} action={<Button size="sm" loading={busy} onPress={pick}>Ajouter</Button>}>
      {images.length === 0 ? (
        <EmptyState text="Aucune image" />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {images.map((img) => {
            const url = resolveTabletImageUrl(img.url);
            return (
              <View key={img.id} style={{ position: 'relative' }}>
                <Image source={{ uri: url ?? '', headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={{ width: 130, height: 130, borderRadius: radius.md, backgroundColor: colors.gray[100] }} />
                <Pressable onPress={() => setToDelete(img.id)} style={{ position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={14} color={colors.white} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => toDelete && remove.mutate(toDelete, { onSuccess: () => setToDelete(null) })} title="Supprimer l'image" message="Cette image sera supprimee." confirmLabel="Supprimer" variant="destructive" loading={remove.isPending} />
    </SectionCard>
  );
}

function HistoryTab({ parcelId }: { parcelId: string }) {
  const { data } = useParcelHistory(parcelId);
  const history: any[] = data?.data ?? [];
  return (
    <SectionCard title={`Historique (${history.length})`}>
      {history.length === 0 ? (
        <EmptyState text="Aucun evenement" />
      ) : (
        <View style={{ gap: spacing.md }}>
          {history.map((h, i) => (
            <View key={h.id ?? i} style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: i === 0 ? colors.primary[500] : colors.gray[300], marginTop: 4 }} />
                {i < history.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: colors.gray[200] }} />}
              </View>
              <View style={{ flex: 1, paddingBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{h.action}</Text>
                  <Text style={{ fontSize: 11, color: colors.gray[400] }}>{h.createdAt ? formatDateTime(h.createdAt) : ''}</Text>
                </View>
                {(h.statusBefore || h.statusAfter) && (
                  <Text style={{ fontSize: 12, color: colors.gray[500] }}>{h.statusBefore ?? '?'} → {h.statusAfter ?? '?'}</Text>
                )}
                {!!h.user && <Text style={{ fontSize: 12, color: colors.gray[400] }}>par {h.user.firstName} {h.user.lastName}</Text>}
                {!!h.comment && <Text style={{ fontSize: 12, fontStyle: 'italic', color: colors.gray[500], marginTop: 2 }}>{h.comment}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}
    </SectionCard>
  );
}
