import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
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
import { fundTransfersApi } from '@/lib/api/finance';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { FundTransferFormDialog } from './FundTransferFormDialog';

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'error'> = { PENDING: 'warning', CONFIRMED: 'success', VOIDED: 'error' };
const DEST: Record<string, string> = { HQ: 'Siege', BANK: 'Banque', AGENCY: 'Agence' };
const exportColumns = [{ key: 'reference', label: 'Reference' }, { key: 'sourceAgency', label: 'Agence source' }, { key: 'destinationType', label: 'Destination' }, { key: 'amount', label: 'Montant' }, { key: 'status', label: 'Statut' }];

export default function FundTransfersScreen() {
  const router = useRouter();
  const { page, limit, search, setPage, setSearch, queryParams } = useServerPagination();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<any | null>(null);
  const [voidTarget, setVoidTarget] = useState<any | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({ queryKey: ['fund-transfers', queryParams], queryFn: () => fundTransfersApi.list(queryParams as any) });
  const rows: any[] = data?.data ?? [];
  const meta = data?.meta;
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };
  const exportData = rows.map((r) => ({ ...r, sourceAgency: r.sourceAgency?.name ?? '', destinationType: DEST[r.destinationType] ?? r.destinationType }));

  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); refetch(); } catch (e) { toast.error(extractApiError(e, 'Erreur')); } };

  const columns: Column<any>[] = [
    { key: 'reference', label: 'Reference', width: 160, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{r.reference}</Text> },
    { key: 'sourceAgency', label: 'Source', width: 150, render: (r) => <Text style={{ fontSize: 13 }}>{r.sourceAgency?.name ?? '-'}</Text> },
    { key: 'destinationType', label: 'Destination', width: 130, render: (r) => <Text style={{ fontSize: 13 }}>{DEST[r.destinationType] ?? r.destinationType}</Text> },
    { key: 'amount', label: 'Montant', width: 140, align: 'right', render: (r) => <Text style={{ fontSize: 13, fontWeight: '700' }}>{formatAmount(Number(r.amount ?? 0))}</Text> },
    { key: 'transferMethod', label: 'Mode', width: 120, render: (r) => <Text style={{ fontSize: 13 }}>{r.transferMethod ?? '-'}</Text> },
    { key: 'status', label: 'Statut', width: 110, render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? 'default'}>{r.status}</Badge> },
    { key: 'createdAt', label: 'Date', width: 150, render: (r) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{r.createdAt ? formatDateTime(r.createdAt) : '-'}</Text> },
    { key: 'actions', label: '', width: 60, align: 'center', render: (r) => (
      <RowActions actions={[
        { label: 'Voir details', icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/fund-transfers/${r.id}`) },
        ...(r.status === 'PENDING' ? [{ label: 'Confirmer', icon: <Ionicons name="checkmark-circle-outline" size={18} color={colors.primary[600]} />, onPress: () => setConfirmTarget(r) }] : []),
        ...(r.status !== 'VOIDED' ? [{ label: 'Annuler', icon: <Ionicons name="ban-outline" size={18} color={colors.error} />, onPress: () => setVoidTarget(r), variant: 'destructive' as const }] : []),
      ]} />
    ) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader title="Transferts de fonds" subtitle={`${meta?.total ?? rows.length} transferts`} actions={<Can permission="fund_transfer.create"><HeaderAction label="Nouveau transfert" icon="add" onPress={() => setShowCreate(true)} /></Can>} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}><SearchBar value={search} onChange={setSearch} placeholder="Rechercher un transfert..." /></View>
          <ExportButton data={exportData} columns={exportColumns} fileName="transferts" />
        </View>
        <Card padding="sm">
          <AppDataTable columns={columns} data={rows} isLoading={isLoading} page={page} totalPages={meta?.totalPages ?? 1} total={meta?.total} limit={limit} onPageChange={setPage} onRowClick={(r) => router.push(`/fund-transfers/${r.id}`)} emptyMessage="Aucun transfert" />
        </Card>
      </ScrollView>
      <FundTransferFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <ConfirmDialog open={!!confirmTarget} onClose={() => setConfirmTarget(null)} onConfirm={() => { if (confirmTarget) act(() => fundTransfersApi.confirm(confirmTarget.id), 'Transfert confirme'); setConfirmTarget(null); }} title="Confirmer le transfert" message={`Confirmer le transfert de ${formatAmount(Number(confirmTarget?.amount ?? 0))} ? Irreversible.`} confirmLabel="Confirmer" />
      <ConfirmDialog open={!!voidTarget} onClose={() => setVoidTarget(null)} onConfirm={() => { if (voidTarget) act(() => fundTransfersApi.void(voidTarget.id, 'Annulation manuelle'), 'Transfert annule'); setVoidTarget(null); }} title="Annuler le transfert" message={`Le transfert sera annule et la caisse source recreditee. Irreversible.`} confirmLabel="Confirmer l'annulation" variant="destructive" />
    </View>
  );
}
