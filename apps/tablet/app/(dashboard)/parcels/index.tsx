import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, HeaderAction } from '@/components/data/PageHeader';
import { SearchBar } from '@/components/data/SearchBar';
import { ExportButton } from '@/components/data/ExportButton';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { RowActions } from '@/components/data/RowActions';
import { ParcelHandoverDialog } from '@/components/data/ParcelHandoverDialog';
import { Can } from '@/components/auth/Can';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { useParcels, useArchiveParcels, useUnarchiveParcels } from '@/lib/hooks/useParcels';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { ParcelFormDialog } from './ParcelFormDialog';
import { ParcelGroupFormDialog } from './ParcelGroupFormDialog';

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'info' | 'error'> = {
  IN_STOCK: 'default', LOADING: 'info', IN_TRANSIT: 'warning', ARRIVED: 'info', RECEIVED: 'info', DELIVERED: 'success', LOST: 'error',
};
const CATEGORY_LABEL: Record<string, string> = { STANDARD: 'Standard', DOCUMENT: 'Document', FOOD: 'Alimentaire', ELECTRONICS: 'Electronique', CLOTHING: 'Vetements', OTHER: 'Autre' };
const STATUS_FILTERS = [
  { v: '', l: 'Tous' }, { v: 'IN_STOCK', l: 'En stock' }, { v: 'IN_TRANSIT', l: 'En transit' },
  { v: 'ARRIVED', l: 'Arrives' }, { v: 'RECEIVED', l: 'Recus' }, { v: 'DELIVERED', l: 'Livres' },
];

const exportColumns = [
  { key: 'trackingNumber', label: 'Tracking' }, { key: 'designation', label: 'Designation' },
  { key: 'category', label: 'Type' }, { key: 'weight', label: 'Masse' }, { key: 'price', label: 'Prix' }, { key: 'status', label: 'Statut' },
];

export default function ParcelsScreen() {
  const router = useRouter();
  const { page, limit, search, setPage, setSearch, queryParams } = useServerPagination();
  const [view, setView] = useState<'parcels' | 'groups'>('parcels');
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [handoverParcel, setHandoverParcel] = useState<any | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const archive = useArchiveParcels();
  const unarchive = useUnarchiveParcels();

  const { data, isLoading, refetch } = useParcels({ ...queryParams, status: statusFilter || undefined, archived: tab === 'archived' ? 'true' : undefined } as any);
  const { data: groupsData } = useQuery({ queryKey: ['parcel-groups', queryParams], queryFn: () => apiClient.get('/parcel-groups', { params: queryParams }).then((r) => r.data), enabled: view === 'groups' });

  const parcels: any[] = data?.data ?? [];
  const groups: any[] = groupsData?.data ?? [];
  const meta = view === 'groups' ? groupsData?.meta : data?.meta;

  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const toggleOne = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSel = parcels.length > 0 && parcels.every((p) => selected.has(p.id));
  const toggleAll = () => setSelected((p) => { const n = new Set(p); if (allSel) parcels.forEach((x) => n.delete(x.id)); else parcels.forEach((x) => n.add(x.id)); return n; });

  const doArchive = () => {
    const ids = Array.from(selected);
    const m = tab === 'archived' ? unarchive : archive;
    m.mutate({ ids } as never, { onSuccess: () => { setSelected(new Set()); toast.success('Effectue'); refetch(); } });
  };

  const parcelColumns: Column<any>[] = [
    { key: 'sel', label: '', width: 44, render: (r) => <Pressable onPress={() => toggleOne(r.id)} hitSlop={8}><Ionicons name={selected.has(r.id) ? 'checkbox' : 'square-outline'} size={20} color={selected.has(r.id) ? colors.primary[600] : colors.gray[400]} /></Pressable> },
    { key: 'trackingNumber', label: 'Tracking', width: 150, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{r.trackingNumber}</Text> },
    { key: 'designation', label: 'Designation', width: 170, render: (r) => <View><Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[900] }} numberOfLines={1}>{r.designation}</Text>{!!r.destination && <Text style={{ fontSize: 12, color: colors.gray[400] }} numberOfLines={1}>{r.destination}</Text>}</View> },
    { key: 'client', label: 'Client', width: 150, render: (r) => <Text style={{ fontSize: 13 }}>{r.client?.fullName ?? '-'}</Text> },
    { key: 'category', label: 'Type', width: 130, render: (r) => <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}><Badge>{CATEGORY_LABEL[r.category] ?? r.category}</Badge>{r.isFragile && <Badge variant="warning">Fragile</Badge>}{r.isHazardous && <Badge variant="error">Danger</Badge>}</View> },
    { key: 'weight', label: 'Masse/Vol', width: 110, align: 'right', render: (r) => <Text style={{ fontSize: 13 }}>{r.weight ? `${r.weight} kg` : ''}{r.volume ? ` ${r.volume} m³` : ''}{!r.weight && !r.volume ? '-' : ''}</Text> },
    { key: 'price', label: 'Prix', width: 120, align: 'right', render: (r) => <Text style={{ fontSize: 13, fontWeight: '700' }}>{formatAmount(Number(r.price ?? 0))}</Text> },
    { key: 'status', label: 'Statut', width: 120, render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? 'default'}>{r.status}</Badge> },
    { key: 'createdAt', label: 'Date', width: 120, render: (r) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{formatDate(r.createdAt)}</Text> },
    {
      key: 'actions', label: '', width: 60, align: 'center',
      render: (r) => (
        <RowActions actions={[
          { label: 'Voir details', icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/parcels/${r.id}`) },
          ...(r.status !== 'DELIVERED' ? [{ label: 'Remettre au client', icon: <Ionicons name="hand-left-outline" size={18} color={colors.gray[700]} />, onPress: () => setHandoverParcel(r) }] : []),
          { label: 'Changer statut', icon: <Ionicons name="sync-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/parcels/${r.id}`) },
        ]} />
      ),
    },
  ];

  const groupColumns: Column<any>[] = [
    { key: 'reference', label: 'Reference', width: 160, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{r.reference}</Text> },
    { key: 'label', label: 'Libelle', width: 160, render: (r) => <Text style={{ fontSize: 13 }}>{r.label ?? '-'}</Text> },
    { key: 'client', label: 'Client', width: 150, render: (r) => <Text style={{ fontSize: 13 }}>{r.client?.fullName ?? '-'}</Text> },
    { key: 'parcels', label: 'Colis', width: 80, align: 'center', render: (r) => <Badge>{String(r._count?.parcels ?? 0)}</Badge> },
    { key: 'status', label: 'Statut', width: 120, render: (r) => <Badge>{r.status}</Badge> },
    { key: 'createdAt', label: 'Date', width: 120, render: (r) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{formatDate(r.createdAt)}</Text> },
  ];

  const chip = (active: boolean) => ({ paddingVertical: 7, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: active ? colors.primary[400] : colors.gray[300], backgroundColor: active ? colors.primary[50] : colors.white });

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader
          title="Colis"
          subtitle={`${meta?.total ?? 0} ${view === 'groups' ? 'groupes' : tab === 'archived' ? 'archives' : 'actifs'}`}
          actions={<Can permission="parcel.create"><HeaderAction label="Groupe de colis" icon="albums-outline" variant="outline" onPress={() => setShowGroup(true)} /><HeaderAction label="Nouveau colis" icon="add" onPress={() => setShowCreate(true)} /></Can>}
        />

        {/* Toggle colis/groupes */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(['parcels', 'groups'] as const).map((v) => (
            <Pressable key={v} onPress={() => { setView(v); setSelected(new Set()); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radius.md, backgroundColor: view === v ? colors.primary[50] : colors.gray[100] }}>
              <Ionicons name={v === 'parcels' ? 'cube-outline' : 'albums-outline'} size={16} color={view === v ? colors.primary[700] : colors.gray[500]} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: view === v ? colors.primary[700] : colors.gray[600] }}>{v === 'parcels' ? 'Colis' : 'Groupes de colis'}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}><SearchBar value={search} onChange={setSearch} placeholder="Tracking, designation, client..." /></View>
          <ExportButton data={view === 'groups' ? groups : parcels} columns={exportColumns} fileName="colis" />
        </View>

        {view === 'parcels' && (
          <>
            {/* Actifs / Archives */}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {(['active', 'archived'] as const).map((tb) => (
                <Pressable key={tb} onPress={() => { setTab(tb); setSelected(new Set()); setPage(1); }} style={chip(tab === tb)}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: tab === tb ? colors.primary[700] : colors.gray[600] }}>{tb === 'active' ? 'En cours' : 'Archives'}</Text>
                </Pressable>
              ))}
            </View>
            {/* Status chips */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {STATUS_FILTERS.map((s) => (
                <Pressable key={s.v} onPress={() => { setStatusFilter(s.v); setPage(1); }} style={chip(statusFilter === s.v)}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: statusFilter === s.v ? colors.primary[700] : colors.gray[600] }}>{s.l}</Text>
                </Pressable>
              ))}
            </View>
            {/* Selection bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 36 }}>
              <Pressable onPress={toggleAll} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36 }}>
                <Ionicons name={allSel ? 'checkbox' : 'square-outline'} size={20} color={allSel ? colors.primary[600] : colors.gray[400]} />
                <Text style={{ fontSize: 13, color: colors.gray[600] }}>Tout cocher (page)</Text>
              </Pressable>
              {selected.size > 0 && (
                <>
                  <View style={{ flex: 1 }} />
                  <Badge variant="success">{`${selected.size} selectionne(s)`}</Badge>
                  <HeaderAction label={tab === 'archived' ? 'Desarchiver' : 'Archiver'} icon={tab === 'archived' ? 'archive-outline' : 'file-tray-full-outline'} variant="outline" onPress={doArchive} />
                </>
              )}
            </View>
          </>
        )}

        <Card padding="sm">
          {view === 'parcels' ? (
            <AppDataTable columns={parcelColumns} data={parcels} isLoading={isLoading} page={page} totalPages={meta?.totalPages ?? 1} total={meta?.total} limit={limit} onPageChange={setPage} onRowClick={(r) => router.push(`/parcels/${r.id}`)} emptyMessage="Aucun colis" />
          ) : (
            <AppDataTable columns={groupColumns} data={groups} page={page} totalPages={meta?.totalPages ?? 1} total={meta?.total} limit={limit} onPageChange={setPage} onRowClick={(r) => router.push(`/parcel-groups/${r.id}`)} emptyMessage="Aucun groupe" />
          )}
        </Card>
      </ScrollView>

      <ParcelFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <ParcelGroupFormDialog open={showGroup} onClose={() => setShowGroup(false)} />
      <ParcelHandoverDialog open={!!handoverParcel} onClose={() => setHandoverParcel(null)} parcel={handoverParcel} onSuccess={refetch} />
    </View>
  );
}
