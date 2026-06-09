import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, HeaderAction } from '@/components/data/PageHeader';
import { SearchBar } from '@/components/data/SearchBar';
import { ExportButton } from '@/components/data/ExportButton';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { RowActions } from '@/components/data/RowActions';
import { Can } from '@/components/auth/Can';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { usePayments } from '@/lib/hooks/usePayments';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { PaymentFormDialog } from './PaymentFormDialog';

const METHOD_LABELS: Record<string, string> = { CASH: 'Especes', MOBILE_MONEY: 'Mobile Money', BANK_TRANSFER: 'Virement', CARD: 'Carte', CHECK: 'Cheque' };
const exportColumns = [
  { key: 'reference', label: 'Reference' }, { key: 'amount', label: 'Montant' }, { key: 'paymentMethod', label: 'Mode' }, { key: 'agency', label: 'Agence' }, { key: 'createdAt', label: 'Date' },
];

export default function PaymentsScreen() {
  const router = useRouter();
  const { page, limit, search, setPage, setSearch, queryParams } = useServerPagination();
  const [showCreate, setShowCreate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = usePayments(queryParams as any);
  const payments: any[] = data?.data ?? [];
  const meta = data?.meta;
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };
  const exportData = payments.map((p) => ({ ...p, agency: p.agency?.name ?? '', paymentMethod: METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod }));

  const columns: Column<any>[] = [
    { key: 'reference', label: 'Reference', width: 160, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{r.reference}</Text> },
    { key: 'invoice', label: 'Facture', width: 150, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, color: colors.gray[600] }}>{r.invoice?.reference ?? '-'}</Text> },
    { key: 'agency', label: 'Agence', width: 140, render: (r) => <Text style={{ fontSize: 13 }}>{r.agency?.name ?? '-'}</Text> },
    { key: 'amount', label: 'Montant', width: 130, align: 'right', render: (r) => <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary[700] }}>{formatAmount(Number(r.amount ?? 0))}</Text> },
    { key: 'paymentMethod', label: 'Mode', width: 130, render: (r) => <Badge>{METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}</Badge> },
    { key: 'receivedBy', label: 'Recu par', width: 150, render: (r) => <Text style={{ fontSize: 13 }}>{r.receivedBy ? `${r.receivedBy.firstName ?? ''} ${r.receivedBy.lastName ?? ''}`.trim() : '-'}</Text> },
    { key: 'isVoided', label: 'Statut', width: 100, render: (r) => <Badge variant={r.isVoided ? 'error' : 'success'}>{r.isVoided ? 'Annule' : 'Valide'}</Badge> },
    { key: 'createdAt', label: 'Date', width: 150, render: (r) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{r.createdAt ? formatDateTime(r.createdAt) : '-'}</Text> },
    {
      key: 'actions', label: '', width: 60, align: 'center',
      render: (r) => (
        <RowActions actions={[
          { label: 'Voir les details', icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/payments/${r.id}`) },
          ...(r.invoice?.id ? [{ label: 'Voir la facture', icon: <Ionicons name="document-text-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/invoices/${r.invoice.id}`) }] : []),
        ]} />
      ),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader title="Paiements" subtitle={`${meta?.total ?? payments.length} paiements`} actions={<Can permission="payment.record"><HeaderAction label="Nouveau paiement" icon="add" onPress={() => setShowCreate(true)} /></Can>} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}><SearchBar value={search} onChange={setSearch} placeholder="Ref paiement, facture, client, tracking..." /></View>
          <ExportButton data={exportData} columns={exportColumns} fileName="paiements" />
        </View>
        <Card padding="sm">
          <AppDataTable columns={columns} data={payments} isLoading={isLoading} page={page} totalPages={meta?.totalPages ?? 1} total={meta?.total} limit={limit} onPageChange={setPage} onRowClick={(r) => router.push(`/payments/${r.id}`)} emptyMessage="Aucun paiement" />
        </Card>
      </ScrollView>
      <PaymentFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </View>
  );
}
