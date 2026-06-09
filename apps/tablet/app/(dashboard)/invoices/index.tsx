import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/data/PageHeader';
import { SearchBar } from '@/components/data/SearchBar';
import { ExportButton } from '@/components/data/ExportButton';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { RowActions } from '@/components/data/RowActions';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { apiClient } from '@/lib/api/client';
import { downloadAndShare } from '@/lib/api/download';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'default'> = { PAID: 'success', PARTIAL: 'warning', UNPAID: 'error', CANCELLED: 'default' };
const STATUS_FILTERS = [{ v: '', l: 'Toutes' }, { v: 'UNPAID', l: 'Non payees' }, { v: 'PARTIAL', l: 'Partielles' }, { v: 'PAID', l: 'Soldees' }];
const exportColumns = [
  { key: 'reference', label: 'Reference' }, { key: 'client', label: 'Client' },
  { key: 'netAmount', label: 'Montant total' }, { key: 'paidAmount', label: 'Paye' }, { key: 'balance', label: 'Solde' }, { key: 'status', label: 'Statut' },
];

export default function InvoicesScreen() {
  const router = useRouter();
  const { page, limit, search, setPage, setSearch, queryParams } = useServerPagination();
  const [statusFilter, setStatusFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['invoices', { ...queryParams, status: statusFilter }],
    queryFn: () => apiClient.get('/invoices', { params: { ...queryParams, status: statusFilter || undefined } }).then((r) => r.data),
  });
  const invoices: any[] = data?.data ?? [];
  const meta = data?.meta;
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };
  const exportData = invoices.map((i) => ({ ...i, client: i.client?.fullName ?? '' }));

  const columns: Column<any>[] = [
    { key: 'reference', label: 'Reference', width: 160, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{r.reference}</Text> },
    { key: 'client', label: 'Client', width: 180, render: (r) => <View><Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[900] }}>{r.client?.fullName ?? '-'}</Text>{!!r.client?.phone && <Text style={{ fontSize: 12, color: colors.gray[400] }}>{r.client.phone}</Text>}</View> },
    { key: 'agency', label: 'Agence', width: 140, render: (r) => <Text style={{ fontSize: 13 }}>{r.agency?.name ?? '-'}</Text> },
    { key: 'netAmount', label: 'Montant', width: 130, align: 'right', render: (r) => <Text style={{ fontSize: 13, fontWeight: '700' }}>{formatAmount(Number(r.netAmount ?? 0))}</Text> },
    { key: 'paidAmount', label: 'Paye', width: 120, align: 'right', render: (r) => <Text style={{ fontSize: 13, color: colors.primary[700], fontWeight: '600' }}>{formatAmount(Number(r.paidAmount ?? 0))}</Text> },
    { key: 'balance', label: 'Solde', width: 120, align: 'right', render: (r) => <Text style={{ fontSize: 13, fontWeight: '600', color: Number(r.balance ?? 0) > 0 ? colors.error : colors.primary[700] }}>{formatAmount(Number(r.balance ?? 0))}</Text> },
    { key: 'status', label: 'Statut', width: 110, render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? 'default'}>{r.status}</Badge> },
    { key: 'issuedAt', label: 'Date', width: 120, render: (r) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{r.issuedAt ? formatDate(r.issuedAt) : '-'}</Text> },
    {
      key: 'actions', label: '', width: 60, align: 'center',
      render: (r) => (
        <RowActions actions={[
          { label: 'Voir les details', icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/invoices/${r.id}`) },
          { label: 'Imprimer PDF', icon: <Ionicons name="document-outline" size={18} color={colors.gray[700]} />, onPress: () => downloadAndShare(`/invoices/${r.id}/pdf`, `facture-${r.reference}`, 'pdf') },
          ...(r.status !== 'PAID' ? [{ label: 'Enregistrer paiement', icon: <Ionicons name="card-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/invoices/${r.id}`) }] : []),
        ]} />
      ),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader title="Factures" subtitle={`${meta?.total ?? invoices.length} factures`} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}><SearchBar value={search} onChange={setSearch} placeholder="Reference, client..." /></View>
          <ExportButton data={exportData} columns={exportColumns} fileName="factures" />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map((s) => (
            <Pressable key={s.v} onPress={() => { setStatusFilter(s.v); setPage(1); }} style={{ paddingVertical: 7, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: statusFilter === s.v ? colors.primary[400] : colors.gray[300], backgroundColor: statusFilter === s.v ? colors.primary[50] : colors.white }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: statusFilter === s.v ? colors.primary[700] : colors.gray[600] }}>{s.l}</Text>
            </Pressable>
          ))}
        </View>
        <Card padding="sm">
          <AppDataTable columns={columns} data={invoices} isLoading={isLoading} page={page} totalPages={meta?.totalPages ?? 1} total={meta?.total} limit={limit} onPageChange={setPage} onRowClick={(r) => router.push(`/invoices/${r.id}`)} emptyMessage="Aucune facture" />
        </Card>
      </ScrollView>
    </View>
  );
}
