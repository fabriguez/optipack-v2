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
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Can } from '@/components/auth/Can';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { disbursementsApi } from '@/lib/api/finance';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { DisbursementFormDialog } from './DisbursementFormDialog';

const exportColumns = [{ key: 'reference', label: 'Reference' }, { key: 'reason', label: 'Motif' }, { key: 'orderer', label: 'Ordonnateur' }, { key: 'amount', label: 'Montant' }, { key: 'createdAt', label: 'Date' }];

export default function DisbursementsScreen() {
  const router = useRouter();
  const { page, limit, search, setPage, setSearch, queryParams } = useServerPagination();
  const [showCreate, setShowCreate] = useState(false);
  const [voidTarget, setVoidTarget] = useState<any | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({ queryKey: ['disbursements', queryParams], queryFn: () => disbursementsApi.list(queryParams as any) });
  const rows: any[] = data?.data ?? [];
  const meta = data?.meta;
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const doVoid = async () => {
    if (!voidTarget) return;
    try { await disbursementsApi.void(voidTarget.id, 'Annulation manuelle'); toast.success('Annule'); refetch(); } catch (e) { toast.error(extractApiError(e, 'Erreur')); }
    setVoidTarget(null);
  };

  const columns: Column<any>[] = [
    { key: 'reference', label: 'Reference', width: 160, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{r.reference}</Text> },
    { key: 'reason', label: 'Motif', width: 180 },
    { key: 'orderer', label: 'Ordonnateur', width: 150, render: (r) => <Text style={{ fontSize: 13 }}>{r.orderer ?? '-'}</Text> },
    { key: 'agency', label: 'Agence', width: 140, render: (r) => <Text style={{ fontSize: 13 }}>{r.agency?.name ?? '-'}</Text> },
    { key: 'amount', label: 'Montant', width: 140, align: 'right', render: (r) => <Text style={{ fontSize: 13, fontWeight: '700', color: colors.error }}>-{formatAmount(Number(r.amount ?? 0))}</Text> },
    { key: 'isVoided', label: 'Statut', width: 100, render: (r) => <Badge variant={r.isVoided ? 'error' : 'success'}>{r.isVoided ? 'Annule' : 'Valide'}</Badge> },
    { key: 'createdAt', label: 'Date', width: 150, render: (r) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{r.createdAt ? formatDateTime(r.createdAt) : '-'}</Text> },
    { key: 'actions', label: '', width: 60, align: 'center', render: (r) => (
      <RowActions actions={[
        { label: 'Voir details', icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/disbursements/${r.id}`) },
        ...(!r.isVoided ? [{ label: 'Annuler', icon: <Ionicons name="ban-outline" size={18} color={colors.error} />, onPress: () => setVoidTarget(r), variant: 'destructive' as const }] : []),
      ]} />
    ) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader title="Bons de decaissement" subtitle={`${meta?.total ?? rows.length} bons`} actions={<Can permission="disbursement.create"><HeaderAction label="Nouveau decaissement" icon="add" onPress={() => setShowCreate(true)} /></Can>} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}><SearchBar value={search} onChange={setSearch} placeholder="Rechercher un decaissement..." /></View>
          <ExportButton data={rows} columns={exportColumns} fileName="decaissements" />
        </View>
        <Card padding="sm">
          <AppDataTable columns={columns} data={rows} isLoading={isLoading} page={page} totalPages={meta?.totalPages ?? 1} total={meta?.total} limit={limit} onPageChange={setPage} onRowClick={(r) => router.push(`/disbursements/${r.id}`)} emptyMessage="Aucun decaissement" />
        </Card>
      </ScrollView>
      <DisbursementFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <ConfirmDialog open={!!voidTarget} onClose={() => setVoidTarget(null)} onConfirm={doVoid} title="Annuler le bon" message={`Le bon ${voidTarget?.reference ?? ''} sera annule. Irreversible.`} confirmLabel="Confirmer l'annulation" variant="destructive" />
    </View>
  );
}
