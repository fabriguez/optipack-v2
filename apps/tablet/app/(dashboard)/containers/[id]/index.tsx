import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { formatDate } from '@transitsoftservices/shared';
import { AppTabs, type TabItem } from '@/components/ui/AppTabs';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { HeaderAction } from '@/components/data/PageHeader';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { RowActions } from '@/components/data/RowActions';
import { SectionCard, StatCard } from '@/components/data/DetailCards';
import { ScannerDialog } from '@/components/data/ScannerDialog';
import { EntityPicker } from '@/components/data/EntityPicker';
import { AppDialog } from '@/components/forms/AppDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useContainer, useContainerParcels, useDepartContainer, useArriveContainer } from '@/lib/hooks/useContainers';
import { containersApi } from '@/lib/api/containers';
import { parcelsApi } from '@/lib/api/parcels';
import { apiClient } from '@/lib/api/client';
import { searchers } from '@/lib/api/searchers';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { ContainerFormDialog } from '../ContainerFormDialog';
import { ContainerDocumentsTab } from './ContainerDocumentsTab';
import { ContainerExpensesTab } from './ContainerExpensesTab';

const STEPS = [
  { v: 'EMPTY', l: 'Vide' }, { v: 'LOADING', l: 'Chargement' }, { v: 'IN_TRANSIT', l: 'En transit' },
  { v: 'RECEIVED', l: 'Recu' }, { v: 'UNLOADED', l: 'Decharge' },
];
const TYPE_LABEL: Record<string, string> = { AIR: 'Aerien', SEA: 'Maritime', LAND: 'Terrestre' };
const ic = (name: keyof typeof Ionicons.glyphMap) => <Ionicons name={name} size={15} color={colors.gray[500]} />;

export default function ContainerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const containerId = String(id);
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useContainer(containerId);
  const depart = useDepartContainer();
  const arrive = useArriveContainer();
  const [showEdit, setShowEdit] = useState(false);
  const [confirm, setConfirm] = useState<null | 'depart' | 'arrive'>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tabKey, setTabKey] = useState(0);
  useFocusEffect(useCallback(() => { setTabKey((k) => k + 1); }, []));

  const c = data?.data;
  const onRefresh = async () => { setRefreshing(true); try { await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ['containers', containerId] })]); } finally { setRefreshing(false); } };

  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!c) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Conteneur introuvable</Text></View>;

  const stepIdx = STEPS.findIndex((s) => s.v === c.status);
  const cap = Number(c.capacity ?? 0); const load = Number(c.currentLoad ?? 0);
  const pct = cap > 0 ? Math.min(100, (load / cap) * 100) : 0;

  const tabs: TabItem[] = [
    { value: 'info', label: 'Informations', icon: ic('cube-outline'), content: <ParcelsSection container={c} /> },
    { value: 'expenses', label: 'Depenses', icon: ic('wallet-outline'), content: <ContainerExpensesTab containerId={containerId} isClosed={c.expensesClosed} parcelCount={c._count?.parcels ?? 0} /> },
    { value: 'documents', label: 'Documents', icon: ic('document-text-outline'), content: <ContainerDocumentsTab containerId={containerId} /> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
            <Pressable onPress={() => router.navigate('/containers')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>{c.designation}</Text>
                <Badge>{c.status}</Badge>
                {c.isForwarding && <Badge variant="info">Acheminement</Badge>}
              </View>
              <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>{c.departureAgency?.name ?? '?'} → {c.arrivalAgency?.name ?? '?'}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {(c.status === 'EMPTY' || c.status === 'LOADING') && <HeaderAction label="Modifier" icon="create-outline" variant="outline" onPress={() => setShowEdit(true)} />}
            {c.status === 'LOADING' && <HeaderAction label="Depart" icon="play" onPress={() => setConfirm('depart')} />}
            {c.status === 'IN_TRANSIT' && <HeaderAction label="Arrivee" icon="checkmark-done" onPress={() => setConfirm('arrive')} />}
          </View>
        </View>

        {/* Stepper */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {STEPS.map((s, i) => (
            <View key={s.v} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
                <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : i <= stepIdx ? colors.primary[500] : colors.gray[200] }} />
                <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: i <= stepIdx ? colors.primary[500] : colors.gray[200] }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: i <= stepIdx ? colors.white : colors.gray[500] }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, height: 2, backgroundColor: i === STEPS.length - 1 ? 'transparent' : i < stepIdx ? colors.primary[500] : colors.gray[200] }} />
              </View>
              <Text style={{ fontSize: 11, color: i <= stepIdx ? colors.primary[700] : colors.gray[400], marginTop: 4 }}>{s.l}</Text>
            </View>
          ))}
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <StatCard label="Type" value={TYPE_LABEL[c.type ?? ''] ?? c.type ?? '-'} />
          <StatCard label="Colis charges" value={String(c._count?.parcels ?? 0)} color={colors.primary[700]} />
          <StatCard label="Chargement" value={`${Math.round(pct)}%`} hint={`${load} / ${cap} ${c.type === 'SEA' ? 'm³' : 'kg'}`} />
          <StatCard label="Cree le" value={c.createdAt ? formatDate(c.createdAt) : '-'} />
        </View>

        <AppTabs key={tabKey} tabs={tabs} />
      </ScrollView>

      <ContainerFormDialog open={showEdit} onClose={() => setShowEdit(false)} container={c} />
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === 'depart') depart.mutate(containerId, { onSuccess: () => { setConfirm(null); onRefresh(); } });
          else if (confirm === 'arrive') arrive.mutate(containerId, { onSuccess: () => { setConfirm(null); onRefresh(); } });
        }}
        title={confirm === 'depart' ? 'Demarrer le transit' : 'Receptionner le conteneur'}
        message={confirm === 'depart' ? 'Le conteneur passera en transit.' : 'Le conteneur passera a RECEIVED.'}
        confirmLabel="Confirmer"
        loading={depart.isPending || arrive.isPending}
      />
    </View>
  );
}

function ParcelsSection({ container }: { container: any }) {
  const router = useRouter();
  const qc = useQueryClient();
  const containerId = container.id as string;
  const { data } = useContainerParcels(containerId);
  const parcels: any[] = data?.data ?? [];
  const status = container.status;
  const canLoad = status === 'EMPTY' || status === 'LOADING';
  const canUnload = status === 'RECEIVED';

  const [scanMode, setScanMode] = useState<null | 'load' | 'unload'>(null);
  const [unloadWh, setUnloadWh] = useState({ id: '', name: '' });
  const [showUnloadWh, setShowUnloadWh] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<any | null>(null);
  const [removeReason, setRemoveReason] = useState('');

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['containers', containerId] }); qc.invalidateQueries({ queryKey: ['parcels'] }); };

  const onScan = async (code: string) => {
    try {
      if (scanMode === 'load') {
        await containersApi.loadByQr(containerId, code.trim());
        toast.success(`Charge : ${code}`);
      } else if (scanMode === 'unload') {
        const r = await parcelsApi.search(code.trim());
        const p = (r?.data ?? []).find((x: any) => x.trackingNumber === code.trim()) ?? r?.data?.[0];
        if (!p) { toast.error('Introuvable'); return; }
        await containersApi.unload(containerId, { parcelId: p.id, action: 'received', warehouseId: unloadWh.id });
        toast.success(`Decharge : ${p.trackingNumber}`);
      }
      invalidate();
    } catch (e: any) { toast.error(e?.response?.data?.message ?? 'Echec'); }
  };

  const markMissing = async (p: any) => {
    try { await apiClient.post(`/manifests/discrepancies/${containerId}/parcels/${p.id}/missing`, {}); toast.success('Marque non recu'); invalidate(); }
    catch (e: any) { toast.error(e?.response?.data?.message ?? 'Echec'); }
  };

  const columns: Column<any>[] = [
    { key: 'trackingNumber', label: 'Tracking', width: 150, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{r.trackingNumber}</Text> },
    { key: 'designation', label: 'Designation', width: 170 },
    { key: 'weight', label: 'Masse/Vol', width: 110, align: 'right', render: (r) => <Text style={{ fontSize: 13 }}>{r.weight ? `${r.weight} kg` : ''}{r.volume ? ` ${r.volume} m³` : ''}{!r.weight && !r.volume ? '-' : ''}</Text> },
    { key: 'client', label: 'Client', width: 150, render: (r) => <Text style={{ fontSize: 13 }}>{r.client?.fullName ?? '-'}</Text> },
    { key: 'status', label: 'Statut', width: 120, render: (r) => <Badge>{r.status}</Badge> },
    {
      key: 'actions', label: '', width: 60, align: 'center',
      render: (r) => (
        <RowActionsInline
          actions={[
            { label: 'Voir', icon: 'eye-outline', onPress: () => router.push(`/parcels/${r.id}`) },
            ...(status === 'LOADING' ? [{ label: 'Retirer (erreur)', icon: 'remove-circle-outline' as const, onPress: () => { setRemoveTarget(r); setRemoveReason(''); } }] : []),
            ...((status === 'IN_TRANSIT' || status === 'RECEIVED') && r.status !== 'LOST' ? [{ label: 'Marquer non recu', icon: 'alert-circle-outline' as const, onPress: () => markMissing(r), destructive: true }] : []),
          ]}
        />
      ),
    },
  ];

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        {canLoad && <HeaderAction label="Charger par scan" icon="camera-outline" variant="outline" onPress={() => setScanMode('load')} />}
        {canUnload && <HeaderAction label="Decharger par scan" icon="camera-outline" variant="outline" onPress={() => { setUnloadWh({ id: '', name: '' }); setShowUnloadWh(true); }} />}
      </View>

      <SectionCard title={`Colis (${data?.meta?.total ?? parcels.length})`}>
        <AppDataTable columns={columns} data={parcels} emptyMessage="Aucun colis" onRowClick={(r) => router.push(`/parcels/${r.id}`)} />
      </SectionCard>

      <ScannerDialog open={scanMode !== null} onClose={() => setScanMode(null)} onDetected={onScan} closeOnDetect={false} title={scanMode === 'load' ? 'Charger par scan' : 'Decharger par scan'} />

      <AppDialog open={showUnloadWh} onClose={() => setShowUnloadWh(false)} title="Magasin de reception" width={460}
        footer={<><Button variant="ghost" onPress={() => setShowUnloadWh(false)}>Annuler</Button><Button disabled={!unloadWh.id} onPress={() => { setShowUnloadWh(false); setScanMode('unload'); }}>Scanner</Button></>}>
        <EntityPicker value={unloadWh.id} name={unloadWh.name} onChange={(id, nm) => setUnloadWh({ id, name: nm })} searcher={searchers.warehouses} queryKey="warehouses" placeholder="Choisir un magasin..." />
      </AppDialog>

      <AppDialog open={!!removeTarget} onClose={() => setRemoveTarget(null)} title="Retirer du conteneur" width={440}
        footer={<><Button variant="ghost" onPress={() => setRemoveTarget(null)}>Annuler</Button><Button variant="destructive" disabled={removeReason.trim().length < 2} onPress={async () => { try { await containersApi.removeParcel(containerId, removeTarget.id, removeReason); toast.success('Retire'); invalidate(); setRemoveTarget(null); } catch (e: any) { toast.error(e?.response?.data?.message ?? 'Echec'); } }}>Retirer</Button></>}>
        <Text style={{ fontSize: 13, color: colors.gray[600] }}>{removeTarget?.trackingNumber} — {removeTarget?.designation}</Text>
        <Input label="Raison" value={removeReason} onChangeText={setRemoveReason} placeholder="Charge par erreur..." />
      </AppDialog>
    </View>
  );
}

function RowActionsInline({ actions }: { actions: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; destructive?: boolean }[] }) {
  return <RowActions actions={actions.map((a) => ({ label: a.label, icon: <Ionicons name={a.icon} size={18} color={a.destructive ? colors.error : colors.gray[700]} />, onPress: a.onPress, variant: a.destructive ? ('destructive' as const) : ('default' as const) }))} />;
}
