import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';
import { Badge } from '@/components/ui/Badge';
import { SectionCard, InfoCard, StatCard } from '@/components/data/DetailCards';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { usePullRefresh } from '@/lib/hooks/usePullRefresh';
import { accountingApi } from '@/lib/api/finance';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { SOURCE_LABELS } from './index';

const SOURCE_PATH: Record<string, string> = { PAYMENT: 'payments', DISBURSEMENT: 'disbursements', TRANSFER: 'fund-transfers', EXPENSE: 'expenses', PENALTY: 'penalties' };

export default function JournalEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eId = String(id);
  const router = useRouter();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['accounting', eId], queryFn: () => accountingApi.getEntry(eId), enabled: !!eId });
  const { refreshing, onRefresh } = usePullRefresh(refetch);

  const e = data?.data;
  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!e) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Ecriture introuvable</Text></View>;

  const lines: any[] = e.lines ?? [];
  const totalDebit = lines.reduce((s, l) => s + Number(l.debitAmount ?? 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.creditAmount ?? 0), 0);
  const balanced = Math.round(totalDebit) === Math.round(totalCredit);

  const columns: Column<any>[] = [
    { key: 'debitAccount', label: 'Compte debit', width: 180, render: (l) => <Text style={{ fontSize: 12 }}>{l.debitAccount ? `${l.debitAccount.code} ${l.debitAccount.name}` : '-'}</Text> },
    { key: 'creditAccount', label: 'Compte credit', width: 180, render: (l) => <Text style={{ fontSize: 12 }}>{l.creditAccount ? `${l.creditAccount.code} ${l.creditAccount.name}` : '-'}</Text> },
    { key: 'debitAmount', label: 'Debit', width: 120, align: 'right', render: (l) => <Text style={{ fontSize: 13 }}>{Number(l.debitAmount ?? 0) > 0 ? formatAmount(Number(l.debitAmount)) : '-'}</Text> },
    { key: 'creditAmount', label: 'Credit', width: 120, align: 'right', render: (l) => <Text style={{ fontSize: 13 }}>{Number(l.creditAmount ?? 0) > 0 ? formatAmount(Number(l.creditAmount)) : '-'}</Text> },
    { key: 'description', label: 'Libelle', width: 180, render: (l) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{l.description ?? ''}</Text> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Pressable onPress={() => router.navigate('/accounting')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
            <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.gray[900] }}>{e.description}</Text>
              <Badge variant="info">{SOURCE_LABELS[e.sourceType] ?? e.sourceType}</Badge>
              {e.sourceId && SOURCE_PATH[e.sourceType] && (
                <Pressable onPress={() => router.push(`/${SOURCE_PATH[e.sourceType]}/${e.sourceId}`)}><Text style={{ fontSize: 12, color: colors.primary[600] }}>Voir la source</Text></Pressable>
              )}
            </View>
            <Text style={{ fontFamily: 'monospace', fontSize: 12, color: colors.gray[400], marginTop: 2 }}>{e.reference} · {e.date || e.createdAt ? formatDateTime(e.date ?? e.createdAt) : ''}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <StatCard label="Total debit" value={formatAmount(totalDebit)} color={colors.primary[700]} />
          <StatCard label="Total credit" value={formatAmount(totalCredit)} color={colors.error} />
          <InfoCard icon={balanced ? 'checkmark-circle-outline' : 'alert-circle-outline'} label="Equilibre" value={balanced ? 'Equilibre' : 'Desequilibre'} />
        </View>

        <SectionCard title="Lignes d'ecriture">
          <AppDataTable columns={columns} data={lines} emptyMessage="Aucune ligne" />
        </SectionCard>

        {!!e.reverseReason && (
          <View style={{ backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2', borderRadius: radius.md, padding: spacing.lg }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.error }}>Reconciliation / Reversal</Text>
            <Text style={{ fontSize: 13, color: colors.error, marginTop: 4 }}>{e.reverseReason}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
