import { useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/data/PageHeader';
import { AgencyPicker } from '@/components/data/AgencyPicker';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { StatCard } from '@/components/data/DetailCards';
import { financeTimelineApi } from '@/lib/api/finance';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';

const TYPE_META: Record<string, { label: string; variant: 'success' | 'info' | 'default' | 'warning' }> = {
  SALARY_PAYMENT: { label: 'Avance salaire', variant: 'success' },
  CHARGE_PAYMENT: { label: 'Paiement charge', variant: 'info' },
  FUND_TRANSFER: { label: 'Transfert', variant: 'default' },
  DEBT_CREATED: { label: 'Avance accordee', variant: 'warning' },
  DEBT_PAYMENT: { label: 'Remboursement', variant: 'success' },
};
const TABS = [{ k: 'ALL', l: 'Tout' }, { k: 'SALARY_PAYMENT', l: 'Avances salaires' }, { k: 'CHARGE_PAYMENT', l: 'Charges' }, { k: 'FUND_TRANSFER', l: 'Transferts' }, { k: 'DEBT_CREATED', l: 'Avances accordees' }, { k: 'DEBT_PAYMENT', l: 'Remboursements' }];

export default function FinanceHistoryScreen() {
  const [agency, setAgency] = useState({ id: '', name: '' });
  const [tab, setTab] = useState('ALL');
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['finance-timeline', agency.id, tab],
    queryFn: () => financeTimelineApi.list({ agencyId: agency.id || undefined, types: tab === 'ALL' ? undefined : tab, limit: 200 }),
  });
  const rows: any[] = data?.data ?? [];
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const totals = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const e of rows) acc[e.type] = (acc[e.type] ?? 0) + Number(e.amount ?? 0);
    return acc;
  }, [rows]);

  const columns: Column<any>[] = [
    { key: 'type', label: 'Type', width: 150, render: (r) => <Badge variant={TYPE_META[r.type]?.variant ?? 'default'}>{TYPE_META[r.type]?.label ?? r.type}</Badge> },
    { key: 'date', label: 'Date', width: 150, render: (r) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{r.date ? formatDateTime(r.date) : '-'}</Text> },
    { key: 'label', label: 'Operation', width: 220, render: (r) => <View><Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[900] }} numberOfLines={1}>{r.label}</Text>{!!r.description && <Text style={{ fontSize: 11, color: colors.gray[400] }} numberOfLines={1}>{r.description}</Text>}</View> },
    { key: 'agency', label: 'Agence', width: 140, render: (r) => <Text style={{ fontSize: 13 }}>{r.agencyName ?? '-'}</Text> },
    { key: 'amount', label: 'Montant', width: 130, align: 'right', render: (r) => <Text style={{ fontSize: 13, fontWeight: '600' }}>{formatAmount(Number(r.amount ?? 0))}</Text> },
    { key: 'reference', label: 'Reference', width: 140, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 11, color: colors.gray[400] }}>{r.reference ?? '-'}</Text> },
    { key: 'user', label: 'Par', width: 130, render: (r) => <Text style={{ fontSize: 13 }}>{r.userName ?? '-'}</Text> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader title="Historique financier" subtitle="Salaires, charges, transferts, avances, remboursements" />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {Object.keys(TYPE_META).map((t) => <StatCard key={t} label={TYPE_META[t].label} value={formatAmount(totals[t] ?? 0)} />)}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
          <AgencyPicker value={agency.id} name={agency.name} onChange={(id, nm) => setAgency({ id, name: nm })} placeholder="Toutes agences" />
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', flex: 1 }}>
            {TABS.map((t) => <Pressable key={t.k} onPress={() => setTab(t.k)} style={{ paddingVertical: 7, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: tab === t.k ? colors.primary[400] : colors.gray[300], backgroundColor: tab === t.k ? colors.primary[50] : colors.white }}><Text style={{ fontSize: 12, fontWeight: '600', color: tab === t.k ? colors.primary[700] : colors.gray[600] }}>{t.l}</Text></Pressable>)}
          </View>
        </View>

        <Card padding="sm">
          <AppDataTable columns={columns} data={rows} isLoading={isLoading} emptyMessage="Aucun mouvement" />
        </Card>
      </ScrollView>
    </View>
  );
}
