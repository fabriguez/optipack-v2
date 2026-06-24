import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { formatAmount } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, HeaderAction } from '@/components/data/PageHeader';
import { SearchBar } from '@/components/data/SearchBar';
import { ExportButton } from '@/components/data/ExportButton';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { RowActions } from '@/components/data/RowActions';
import { CsvImportDialog } from '@/components/data/CsvImportDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Can } from '@/components/auth/Can';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { useTransitRoutes, useDeleteTransitRoute } from '@/lib/hooks/useTransitRoutes';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { TransitRouteFormDialog } from './TransitRouteFormDialog';

interface Route {
  id: string;
  name: string;
  type?: string | null;
  departureCity?: string | null;
  departureCountry?: string | null;
  arrivalCity?: string | null;
  arrivalCountry?: string | null;
  pricePerKg?: number | string | null;
  pricePerVolume?: number | string | null;
  estimatedDurationDays?: number | null;
  addedValue?: number | null;
  addedValueType?: 'AMOUNT' | 'PERCENT' | null;
  isActive?: boolean;
}

/** Formate la valeur ajoutee : "+2 000 FCFA", "+10%" ou "-". */
function formatAddedValue(r: Route): string {
  if (r.addedValue == null || !r.addedValueType) return '-';
  if (r.addedValueType === 'PERCENT') return `+${r.addedValue}%`;
  return `+${formatAmount(Number(r.addedValue))}`;
}

const TYPE_LABEL: Record<string, string> = { AIR: 'Aerien', SEA: 'Maritime', LAND: 'Terrestre' };
const TYPE_VARIANT: Record<string, 'info' | 'warning' | 'success'> = { AIR: 'info', SEA: 'warning', LAND: 'success' };
const TYPE_FILTERS = [{ v: '', l: 'Tous' }, { v: 'AIR', l: 'Aerien' }, { v: 'SEA', l: 'Maritime' }, { v: 'LAND', l: 'Terrestre' }];

const exportColumns = [
  { key: 'name', label: 'Nom' }, { key: 'type', label: 'Type' },
  { key: 'departureCity', label: 'Ville depart' }, { key: 'arrivalCity', label: 'Ville arrivee' },
  { key: 'pricePerKg', label: 'Prix/kg' }, { key: 'estimatedDurationDays', label: 'Delai (jours)' },
];

export default function TransitRoutesScreen() {
  const router = useRouter();
  const { page, limit, search, setPage, setSearch, queryParams } = useServerPagination();
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [toDelete, setToDelete] = useState<Route | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const del = useDeleteTransitRoute();

  const { data, isLoading, refetch } = useTransitRoutes({ ...queryParams, type: typeFilter || undefined } as any);
  const routes: Route[] = data?.data ?? [];
  const meta = data?.meta;

  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const handleImport = async (rows: Record<string, string>[]) => {
    let ok = 0;
    for (const r of rows) {
      try {
        await apiClient.post('/transit-routes', {
          name: r.name, type: (r.type || 'AIR').toUpperCase(),
          departureCity: r.departurecity || r.departureCity, departureCountry: r.departurecountry || r.departureCountry,
          arrivalCity: r.arrivalcity || r.arrivalCity, arrivalCountry: r.arrivalcountry || r.arrivalCountry,
          pricePerKg: r.priceperkg ? Number(r.priceperkg) : undefined,
        });
        ok++;
      } catch { /* skip */ }
    }
    toast.success(`${ok}/${rows.length} routes importees`);
    refetch();
  };

  const columns: Column<Route>[] = [
    { key: 'name', label: 'Nom', width: 180, render: (r) => <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary[700] }}>{r.name}</Text> },
    { key: 'type', label: 'Type', width: 110, render: (r) => <Badge variant={TYPE_VARIANT[r.type ?? ''] ?? 'default'}>{TYPE_LABEL[r.type ?? ''] ?? r.type}</Badge> },
    { key: 'departure', label: 'Depart', width: 150, render: (r) => <Text style={{ fontSize: 13 }}>{[r.departureCity, r.departureCountry].filter(Boolean).join(', ')}</Text> },
    { key: 'arrival', label: 'Arrivee', width: 150, render: (r) => <Text style={{ fontSize: 13 }}>{[r.arrivalCity, r.arrivalCountry].filter(Boolean).join(', ')}</Text> },
    { key: 'pricePerKg', label: 'Prix/kg', width: 110, align: 'right', render: (r) => <Text style={{ fontSize: 13 }}>{r.pricePerKg != null ? formatAmount(Number(r.pricePerKg)) : '-'}</Text> },
    { key: 'pricePerVolume', label: 'Prix/m3', width: 110, align: 'right', render: (r) => <Text style={{ fontSize: 13 }}>{r.pricePerVolume != null ? formatAmount(Number(r.pricePerVolume)) : '-'}</Text> },
    { key: 'addedValue', label: 'Valeur ajoutee', width: 130, align: 'right', render: (r) => <Text style={{ fontSize: 13, color: r.addedValue != null ? colors.primary[700] : colors.gray[500] }}>{formatAddedValue(r)}</Text> },
    { key: 'estimatedDurationDays', label: 'Delai', width: 80, align: 'center', render: (r) => <Text style={{ fontSize: 13 }}>{r.estimatedDurationDays ?? 0}j</Text> },
    { key: 'isActive', label: 'Statut', width: 100, render: (r) => <Badge variant={r.isActive === false ? 'error' : 'success'}>{r.isActive === false ? 'Inactif' : 'Actif'}</Badge> },
    {
      key: 'actions', label: '', width: 60, align: 'center',
      render: (r) => (
        <RowActions actions={[
          { label: 'Voir details', icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/transit-routes/${r.id}`) },
          { label: 'Supprimer', icon: <Ionicons name="trash-outline" size={18} color={colors.error} />, onPress: () => setToDelete(r), variant: 'destructive' },
        ]} />
      ),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader
          title="Routes de transit"
          subtitle={`${meta?.total ?? routes.length} routes`}
          actions={
            <Can permission="transit.manage">
              <HeaderAction label="Importer" icon="cloud-upload-outline" variant="outline" onPress={() => setShowImport(true)} />
              <HeaderAction label="Nouvelle route" icon="add" onPress={() => setShowCreate(true)} />
            </Can>
          }
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}><SearchBar value={search} onChange={setSearch} placeholder="Rechercher une route..." /></View>
          <ExportButton data={routes} columns={exportColumns} fileName="routes-transit" />
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {TYPE_FILTERS.map((t) => (
            <Pressable key={t.v} onPress={() => { setTypeFilter(t.v); setPage(1); }} style={{ paddingVertical: 7, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: typeFilter === t.v ? colors.primary[400] : colors.gray[300], backgroundColor: typeFilter === t.v ? colors.primary[50] : colors.white }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: typeFilter === t.v ? colors.primary[700] : colors.gray[600] }}>{t.l}</Text>
            </Pressable>
          ))}
        </View>

        <Card padding="sm">
          <AppDataTable columns={columns} data={routes} isLoading={isLoading} page={page} totalPages={meta?.totalPages ?? 1} total={meta?.total} limit={limit} onPageChange={setPage} onRowClick={(r) => router.push(`/transit-routes/${r.id}`)} emptyMessage="Aucune route" />
        </Card>
      </ScrollView>

      <TransitRouteFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <CsvImportDialog open={showImport} onClose={() => setShowImport(false)} onImport={handleImport} title="Importer des routes" requiredColumns={['name', 'type', 'departureCity', 'departureCountry', 'arrivalCity', 'arrivalCountry', 'pricePerKg']} columnLabels={{ name: 'Nom', type: 'Type', departureCity: 'Ville depart', departureCountry: 'Pays depart', arrivalCity: 'Ville arrivee', arrivalCountry: 'Pays arrivee', pricePerKg: 'Prix/kg' }} />
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null), onError: () => setToDelete(null) })} title="Supprimer la route" message={`La route "${toDelete?.name}" sera supprimee.`} confirmLabel="Supprimer" variant="destructive" loading={del.isPending} />
    </View>
  );
}
