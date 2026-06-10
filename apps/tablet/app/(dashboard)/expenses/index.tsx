import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { PageHeader, HeaderAction } from '@/components/data/PageHeader';
import { SearchBar } from '@/components/data/SearchBar';
import { ExportButton } from '@/components/data/ExportButton';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { RowActions } from '@/components/data/RowActions';
import { Can } from '@/components/auth/Can';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { expensesApi } from '@/lib/api/finance';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { ExpenseFormDialog } from './ExpenseFormDialog';

const exportColumns = [{ key: 'title', label: 'Titre' }, { key: 'reason', label: 'Motif' }, { key: 'category', label: 'Categorie' }, { key: 'amount', label: 'Montant' }, { key: 'createdAt', label: 'Date' }];

export default function ExpensesScreen() {
  const router = useRouter();
  const { page, limit, search, setPage, setSearch, queryParams } = useServerPagination();
  const [showCreate, setShowCreate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch } = useQuery({ queryKey: ['expenses', queryParams], queryFn: () => expensesApi.list(queryParams as any) });
  const rows: any[] = data?.data ?? [];
  const meta = data?.meta;
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const columns: Column<any>[] = [
    { key: 'title', label: 'Titre', width: 180, render: (r) => <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary[700] }}>{r.title}</Text> },
    { key: 'reason', label: 'Motif', width: 180 },
    { key: 'category', label: 'Categorie', width: 130, render: (r) => <Text style={{ fontSize: 13 }}>{r.category || '-'}</Text> },
    { key: 'agency', label: 'Agence', width: 140, render: (r) => <Text style={{ fontSize: 13 }}>{r.agency?.name ?? '-'}</Text> },
    { key: 'amount', label: 'Montant', width: 140, align: 'right', render: (r) => <Text style={{ fontSize: 13, fontWeight: '700', color: colors.error }}>{formatAmount(Number(r.amount ?? 0))}</Text> },
    { key: 'createdAt', label: 'Date', width: 130, render: (r) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{r.createdAt ? formatDate(r.createdAt) : '-'}</Text> },
    { key: 'actions', label: '', width: 60, align: 'center', render: (r) => <RowActions actions={[{ label: 'Voir details', icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/expenses/${r.id}`) }]} /> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader title="Depenses" subtitle={`${meta?.total ?? rows.length} depenses`} actions={<Can permission="expense.create"><HeaderAction label="Nouvelle depense" icon="add" onPress={() => setShowCreate(true)} /></Can>} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}><SearchBar value={search} onChange={setSearch} placeholder="Rechercher une depense..." /></View>
          <ExportButton data={rows} columns={exportColumns} fileName="depenses" />
        </View>
        <Card padding="sm">
          <AppDataTable columns={columns} data={rows} isLoading={isLoading} page={page} totalPages={meta?.totalPages ?? 1} total={meta?.total} limit={limit} onPageChange={setPage} onRowClick={(r) => router.push(`/expenses/${r.id}`)} emptyMessage="Aucune depense" />
        </Card>
      </ScrollView>
      <ExpenseFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </View>
  );
}
