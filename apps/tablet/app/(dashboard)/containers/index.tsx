import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, HeaderAction } from '@/components/data/PageHeader';
import { SearchBar } from '@/components/data/SearchBar';
import { ExportButton } from '@/components/data/ExportButton';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { RowActions } from '@/components/data/RowActions';
import { CsvImportDialog } from '@/components/data/CsvImportDialog';
import { Can } from '@/components/auth/Can';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { useContainers } from '@/lib/hooks/useContainers';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { ContainerFormDialog } from './ContainerFormDialog';

interface Container {
  id: string;
  designation: string;
  type?: string | null;
  status?: string | null;
  isForwarding?: boolean;
  capacity?: number | string | null;
  currentLoad?: number | string | null;
  departureAgency?: { name?: string } | null;
  arrivalAgency?: { name?: string } | null;
  _count?: { parcels?: number };
}

const TYPE_LABEL: Record<string, string> = { AIR: 'Aerien', SEA: 'Maritime', LAND: 'Terrestre' };
const TYPE_VARIANT: Record<string, 'info' | 'warning' | 'success'> = { AIR: 'info', SEA: 'warning', LAND: 'success' };
const STATUS_FILTERS = [
  { v: '', l: 'Tous' }, { v: 'EMPTY', l: 'Vide' }, { v: 'LOADING', l: 'Chargement' },
  { v: 'IN_TRANSIT', l: 'En transit' }, { v: 'RECEIVED', l: 'Recu' }, { v: 'UNLOADED', l: 'Decharge' },
];
const exportColumns = [
  { key: 'designation', label: 'Designation' }, { key: 'type', label: 'Type' },
  { key: 'capacity', label: 'Capacite' }, { key: 'status', label: 'Statut' },
];

export default function ContainersScreen() {
  const router = useRouter();
  const { page, limit, search, setPage, setSearch, queryParams } = useServerPagination();
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Container | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useContainers({ ...queryParams, status: statusFilter || undefined } as any);
  const containers: Container[] = data?.data ?? [];
  const meta = data?.meta;

  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const handleImport = async (rows: Record<string, string>[]) => {
    let ok = 0;
    for (const r of rows) {
      try { await apiClient.post('/containers', { designation: r.designation, type: (r.type || 'SEA').toUpperCase(), capacity: Number(r.capacity), departureAgencyId: r.departureagencyid || r.departureAgencyId, arrivalAgencyId: r.arrivalagencyid || r.arrivalAgencyId }); ok++; } catch { /* skip */ }
    }
    toast.success(`${ok}/${rows.length} conteneurs importes`);
    refetch();
  };

  const columns: Column<Container>[] = [
    { key: 'designation', label: 'Designation', width: 170, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{r.designation}</Text> },
    { key: 'type', label: 'Type', width: 140, render: (r) => <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}><Badge variant={TYPE_VARIANT[r.type ?? ''] ?? 'default'}>{TYPE_LABEL[r.type ?? ''] ?? r.type ?? '-'}</Badge>{r.isForwarding && <Badge>Acheminement</Badge>}</View> },
    { key: 'departureAgency', label: 'Depart', width: 140, render: (r) => <Text style={{ fontSize: 13 }}>{r.departureAgency?.name ?? '-'}</Text> },
    { key: 'arrivalAgency', label: 'Arrivee', width: 140, render: (r) => <Text style={{ fontSize: 13 }}>{r.arrivalAgency?.name ?? '-'}</Text> },
    {
      key: 'capacity', label: 'Capacite', width: 140,
      render: (r) => {
        const cap = Number(r.capacity ?? 0); const load = Number(r.currentLoad ?? 0);
        const pct = cap > 0 ? Math.min(100, (load / cap) * 100) : 0;
        return (
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 11, color: colors.gray[500] }}>{load} / {cap} {r.type === 'SEA' ? 'm³' : 'kg'}</Text>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.gray[200], overflow: 'hidden' }}>
              <View style={{ width: `${pct}%`, height: 6, backgroundColor: colors.primary[500] }} />
            </View>
          </View>
        );
      },
    },
    { key: '_count', label: 'Colis', width: 80, align: 'center', render: (r) => <Text style={{ fontSize: 14, fontWeight: '600' }}>{r._count?.parcels ?? 0}</Text> },
    { key: 'status', label: 'Statut', width: 120, render: (r) => <Badge>{r.status ?? '-'}</Badge> },
    {
      key: 'actions', label: '', width: 60, align: 'center',
      render: (r) => (
        <RowActions actions={[
          { label: 'Voir details', icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/containers/${r.id}`) },
          ...((r.status === 'EMPTY' || r.status === 'LOADING') ? [{ label: 'Modifier', icon: <Ionicons name="create-outline" size={18} color={colors.gray[700]} />, onPress: () => setEditTarget(r) }] : []),
        ]} />
      ),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader
          title="Conteneurs"
          subtitle={`${meta?.total ?? containers.length} conteneurs`}
          actions={
            <Can permission="container.manage">
              <HeaderAction label="Importer" icon="cloud-upload-outline" variant="outline" onPress={() => setShowImport(true)} />
              <HeaderAction label="Nouveau conteneur" icon="add" onPress={() => setShowCreate(true)} />
            </Can>
          }
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}><SearchBar value={search} onChange={setSearch} placeholder="Rechercher un conteneur..." /></View>
          <ExportButton data={containers} columns={exportColumns} fileName="conteneurs" />
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map((s) => (
            <Pressable key={s.v} onPress={() => { setStatusFilter(s.v); setPage(1); }} style={{ paddingVertical: 7, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: statusFilter === s.v ? colors.primary[400] : colors.gray[300], backgroundColor: statusFilter === s.v ? colors.primary[50] : colors.white }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: statusFilter === s.v ? colors.primary[700] : colors.gray[600] }}>{s.l}</Text>
            </Pressable>
          ))}
        </View>

        <Card padding="sm">
          <AppDataTable columns={columns} data={containers} isLoading={isLoading} page={page} totalPages={meta?.totalPages ?? 1} total={meta?.total} limit={limit} onPageChange={setPage} onRowClick={(r) => router.push(`/containers/${r.id}`)} emptyMessage="Aucun conteneur" />
        </Card>
      </ScrollView>

      <ContainerFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <ContainerFormDialog open={!!editTarget} onClose={() => setEditTarget(null)} container={(editTarget ?? undefined) as never} />
      <CsvImportDialog open={showImport} onClose={() => setShowImport(false)} onImport={handleImport} title="Importer des conteneurs" requiredColumns={['designation', 'type', 'capacity', 'departureAgencyId', 'arrivalAgencyId']} columnLabels={{ designation: 'Designation', type: 'Type', capacity: 'Capacite', departureAgencyId: 'ID Agence depart', arrivalAgencyId: 'ID Agence arrivee' }} />
    </View>
  );
}
