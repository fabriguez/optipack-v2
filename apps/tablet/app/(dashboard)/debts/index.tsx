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
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { RowActions } from '@/components/data/RowActions';
import { StatCard } from '@/components/data/DetailCards';
import { Can } from '@/components/auth/Can';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { debtsApi } from '@/lib/api/finance';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { DebtFormDialog } from './DebtFormDialog';

export const STATUS_VARIANT: Record<string, 'warning' | 'info' | 'success' | 'error' | 'default'> = { ACTIVE: 'warning', PARTIALLY_PAID: 'info', CLEARED: 'success', OVERDUE: 'error', LITIGATED: 'warning', CANCELLED: 'default' };
export const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Active', PARTIALLY_PAID: 'Partiellement payee', CLEARED: 'Soldee', OVERDUE: 'En retard', LITIGATED: 'Litigieuse', CANCELLED: 'Annulee' };
export const TYPE_LABEL: Record<string, string> = { CLIENT: 'Client', EMPLOYEE: 'Personnel', AGENCY: 'Agence', CARRIER: 'Transporteur' };
const STATUS_TABS = [{ k: 'all', l: 'Toutes' }, { k: 'overdue', l: 'En retard' }, { k: 'partial', l: 'Partielles' }, { k: 'cleared', l: 'Soldees' }, { k: 'due_today', l: 'Echeance auj.' }];

function tierName(d: any): string {
  return d.client?.fullName ?? d.employee?.fullName ?? d.carrier?.name ?? d.agencyCharge?.label ?? d.creditor ?? d.agency?.name ?? '-';
}

export default function DebtsScreen() {
  const router = useRouter();
  const { page, limit, search, setPage, setSearch, queryParams } = useServerPagination();
  const [bucket, setBucket] = useState<'client' | 'company'>('client');
  const [statusTab, setStatusTab] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data: dashData } = useQuery({ queryKey: ['debts', 'dashboard'], queryFn: () => debtsApi.dashboard() });
  const dash = dashData?.data ?? dashData ?? {};

  const statusParam = statusTab === 'partial' ? { status: 'PARTIALLY_PAID' } : statusTab === 'cleared' ? { status: 'CLEARED' } : statusTab === 'overdue' ? { timeFilter: 'overdue' } : statusTab === 'due_today' ? { timeFilter: 'due_today' } : {};
  const { data, isLoading, refetch } = useQuery({ queryKey: ['debts', { ...queryParams, bucket, statusTab }], queryFn: () => debtsApi.list({ ...queryParams, bucket, ...statusParam } as any) });
  const rows: any[] = data?.data ?? [];
  const meta = data?.meta;
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };
  const totalRemaining = rows.reduce((s, d) => s + Number(d.remainingAmount ?? 0), 0);

  const columns: Column<any>[] = [
    { key: 'reference', label: 'Reference', width: 140, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, color: colors.gray[700] }}>{r.reference}</Text> },
    { key: 'tier', label: 'Tiers', width: 180, render: (r) => <View><Text style={{ fontSize: 14, fontWeight: '500', color: colors.primary[700] }}>{tierName(r)}</Text><Text style={{ fontSize: 11, color: colors.gray[400] }}>{TYPE_LABEL[r.type] ?? r.type}</Text></View> },
    { key: 'motif', label: 'Motif', width: 170 },
    { key: 'totalAmount', label: 'Total', width: 120, align: 'right', render: (r) => <Text style={{ fontSize: 13 }}>{formatAmount(Number(r.totalAmount ?? 0))}</Text> },
    { key: 'remainingAmount', label: 'Restant', width: 120, align: 'right', render: (r) => <Text style={{ fontSize: 13, fontWeight: '700', color: colors.error }}>{formatAmount(Number(r.remainingAmount ?? 0))}</Text> },
    { key: 'nextDueDate', label: 'Echeance', width: 120, render: (r) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{r.nextDueDate ? formatDate(r.nextDueDate) : '-'}</Text> },
    { key: 'status', label: 'Statut', width: 140, render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? 'default'}>{STATUS_LABEL[r.status] ?? r.status}</Badge> },
    { key: 'actions', label: '', width: 60, align: 'center', render: (r) => <RowActions actions={[{ label: 'Voir details', icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/debts/${r.id}`) }]} /> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader title="Dettes" subtitle="Creances clients & dettes entreprise" actions={<Can permission="debt.create"><HeaderAction label="Nouvelle dette" icon="add" onPress={() => setShowCreate(true)} /></Can>} />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <StatCard label="Creances clients" value={formatAmount(Number(dash.clientReceivableTotal ?? 0))} color={colors.warning} />
          <StatCard label="Dettes entreprise" value={formatAmount(Number(dash.companyDebtTotal ?? 0))} color={colors.warning} />
          <StatCard label="Echus clients" value={formatAmount(Number(dash.overdueClientTotal ?? 0))} color={colors.error} />
          <StatCard label="Echus entreprise" value={formatAmount(Number(dash.overdueCompanyTotal ?? 0))} color={colors.error} />
          <StatCard label="Recu ce mois" value={formatAmount(Number(dash.recoveredMonth ?? 0))} color={colors.primary[600]} />
        </View>

        {/* Bucket tabs */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(['client', 'company'] as const).map((b) => (
            <Pressable key={b} onPress={() => { setBucket(b); setPage(1); }} style={{ paddingVertical: 8, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: bucket === b ? colors.primary[50] : colors.gray[100] }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: bucket === b ? colors.primary[700] : colors.gray[600] }}>{b === 'client' ? 'Dettes clients' : 'Dettes entreprise'}</Text>
            </Pressable>
          ))}
        </View>
        {/* Status sub-tabs */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {STATUS_TABS.map((s) => (
            <Pressable key={s.k} onPress={() => { setStatusTab(s.k); setPage(1); }} style={{ paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: statusTab === s.k ? colors.primary[400] : colors.gray[300], backgroundColor: statusTab === s.k ? colors.primary[50] : colors.white }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: statusTab === s.k ? colors.primary[700] : colors.gray[600] }}>{s.l}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}><SearchBar value={search} onChange={setSearch} placeholder="Reference, motif, tiers..." /></View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.error }}>Total restant {formatAmount(totalRemaining)}</Text>
        </View>

        <Card padding="sm">
          <AppDataTable columns={columns} data={rows} isLoading={isLoading} page={page} totalPages={meta?.totalPages ?? 1} total={meta?.total} limit={limit} onPageChange={setPage} onRowClick={(r) => router.push(`/debts/${r.id}`)} emptyMessage="Aucune dette" />
        </Card>
      </ScrollView>
      <DebtFormDialog open={showCreate} onClose={() => setShowCreate(false)} defaultBucket={bucket} />
    </View>
  );
}
