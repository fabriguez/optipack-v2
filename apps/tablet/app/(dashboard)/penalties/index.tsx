import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatAmount } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, HeaderAction } from '@/components/data/PageHeader';
import { SearchBar } from '@/components/data/SearchBar';
import { ExportButton } from '@/components/data/ExportButton';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { RowActions } from '@/components/data/RowActions';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';

const exportColumns = [{ key: 'parcel', label: 'Colis' }, { key: 'client', label: 'Client' }, { key: 'daysAccumulated', label: 'Jours' }, { key: 'totalAmount', label: 'Total' }, { key: 'isPaid', label: 'Paye' }];

export default function PenaltiesScreen() {
  const router = useRouter();
  const { page, limit, search, setPage, setSearch, queryParams } = useServerPagination();
  const [paidFilter, setPaidFilter] = useState<'' | 'true' | 'false'>('');
  const [refreshing, setRefreshing] = useState(false);
  const [recalc, setRecalc] = useState(false);

  const { data, isLoading, refetch } = useQuery({ queryKey: ['penalties', { ...queryParams, isPaid: paidFilter }], queryFn: () => apiClient.get('/penalties', { params: { ...queryParams, isPaid: paidFilter || undefined } }).then((r) => r.data) });
  const rows: any[] = data?.data ?? [];
  const meta = data?.meta;
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };
  const exportData = rows.map((p) => ({ ...p, parcel: p.parcel?.trackingNumber ?? '', client: p.client?.fullName ?? '', isPaid: p.isPaid ? 'Oui' : 'Non' }));

  const doRecalc = async () => { setRecalc(true); try { const r = await apiClient.post('/penalties/calculate').then((x) => x.data); toast.success(`${r?.data?.created ?? r?.created ?? 0} creees, ${r?.data?.updated ?? r?.updated ?? 0} mises a jour`); refetch(); } catch (e) { toast.error(extractApiError(e, 'Erreur')); } finally { setRecalc(false); } };

  const columns: Column<any>[] = [
    { key: 'parcel', label: 'Colis', width: 160, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{r.parcel?.trackingNumber ?? '-'}</Text> },
    { key: 'client', label: 'Client', width: 170, render: (r) => <Text style={{ fontSize: 13 }}>{r.client?.fullName ?? '-'}</Text> },
    { key: 'daysAccumulated', label: 'Jours', width: 80, align: 'center', render: (r) => <Text style={{ fontSize: 13 }}>{r.daysAccumulated ?? 0}</Text> },
    { key: 'dailyRate', label: 'Taux/jour', width: 120, align: 'right', render: (r) => <Text style={{ fontSize: 13 }}>{formatAmount(Number(r.dailyRate ?? 0))}</Text> },
    { key: 'totalAmount', label: 'Total', width: 130, align: 'right', render: (r) => <Text style={{ fontSize: 13, fontWeight: '700', color: colors.error }}>{formatAmount(Number(r.totalAmount ?? 0))}</Text> },
    { key: 'isPaid', label: 'Statut', width: 100, render: (r) => <Badge variant={r.isPaid ? 'success' : 'error'}>{r.isPaid ? 'Paye' : 'Impaye'}</Badge> },
    { key: 'actions', label: '', width: 60, align: 'center', render: (r) => <RowActions actions={[{ label: 'Voir details', icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/penalties/${r.id}`) }]} /> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader title="Penalites de stockage" subtitle="Penalites automatiques apres delai en agence" actions={<HeaderAction label="Recalculer" icon="refresh-outline" variant="outline" onPress={doRecalc} disabled={recalc} />} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}><SearchBar value={search} onChange={setSearch} placeholder="Rechercher..." /></View>
          <ExportButton data={exportData} columns={exportColumns} fileName="penalites" />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {[{ k: '' as const, l: 'Toutes' }, { k: 'false' as const, l: 'Impayees' }, { k: 'true' as const, l: 'Payees' }].map((f) => (
            <Pressable key={f.k} onPress={() => { setPaidFilter(f.k); setPage(1); }} style={{ paddingVertical: 7, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: paidFilter === f.k ? colors.primary[400] : colors.gray[300], backgroundColor: paidFilter === f.k ? colors.primary[50] : colors.white }}><Text style={{ fontSize: 13, fontWeight: '600', color: paidFilter === f.k ? colors.primary[700] : colors.gray[600] }}>{f.l}</Text></Pressable>
          ))}
        </View>
        <Card padding="sm">
          <AppDataTable columns={columns} data={rows} isLoading={isLoading} page={page} totalPages={meta?.totalPages ?? 1} total={meta?.total} limit={limit} onPageChange={setPage} onRowClick={(r) => router.push(`/penalties/${r.id}`)} emptyMessage="Aucune penalite" />
        </Card>
      </ScrollView>
    </View>
  );
}
