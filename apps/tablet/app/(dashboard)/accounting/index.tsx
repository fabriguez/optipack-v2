import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/data/PageHeader';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { accountingApi } from '@/lib/api/finance';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

export const SOURCE_LABELS: Record<string, string> = { PAYMENT: 'Paiement', DISBURSEMENT: 'Decaissement', TRANSFER: 'Transfert', EXPENSE: 'Depense', PENALTY: 'Penalite', SALARY: 'Salaire' };

function sumLines(lines: any[] = [], field: string) { return lines.reduce((s, l) => s + Number(l[field] ?? 0), 0); }

export default function AccountingScreen() {
  const router = useRouter();
  const { page, limit, setPage, queryParams } = useServerPagination();
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch } = useQuery({ queryKey: ['accounting', queryParams], queryFn: () => accountingApi.getLedger(queryParams as any) });
  const rows: any[] = data?.data ?? [];
  const meta = data?.meta;
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const columns: Column<any>[] = [
    { key: 'reference', label: 'Reference', width: 150, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, color: colors.gray[700] }}>{r.reference}</Text> },
    { key: 'description', label: 'Description', width: 200 },
    { key: 'sourceType', label: 'Source', width: 130, render: (r) => <Badge variant="info">{SOURCE_LABELS[r.sourceType] ?? r.sourceType}</Badge> },
    { key: 'debit', label: 'Debit', width: 130, align: 'right', render: (r) => { const v = sumLines(r.lines, 'debitAmount'); return <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary[700] }}>{v > 0 ? formatAmount(v) : '-'}</Text>; } },
    { key: 'credit', label: 'Credit', width: 130, align: 'right', render: (r) => { const v = sumLines(r.lines, 'creditAmount'); return <Text style={{ fontSize: 13, fontWeight: '600', color: colors.error }}>{v > 0 ? formatAmount(v) : '-'}</Text>; } },
    { key: 'createdBy', label: 'Par', width: 150, render: (r) => <Text style={{ fontSize: 13 }}>{r.createdBy ? `${r.createdBy.firstName ?? ''} ${r.createdBy.lastName ?? ''}`.trim() : '-'}</Text> },
    { key: 'date', label: 'Date', width: 150, render: (r) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{r.date || r.createdAt ? formatDateTime(r.date ?? r.createdAt) : '-'}</Text> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader title="Grand Livre" subtitle="Journal comptable debit/credit" />
        <Card padding="sm">
          <AppDataTable columns={columns} data={rows} isLoading={isLoading} page={page} totalPages={meta?.totalPages ?? 1} total={meta?.total} limit={limit} onPageChange={setPage} onRowClick={(r) => router.push(`/accounting/${r.id}`)} emptyMessage="Aucune ecriture" />
        </Card>
      </ScrollView>
    </View>
  );
}
