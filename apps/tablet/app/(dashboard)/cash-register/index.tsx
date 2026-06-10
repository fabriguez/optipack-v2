import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { PageHeader, HeaderAction } from '@/components/data/PageHeader';
import { AgencyPicker } from '@/components/data/AgencyPicker';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { StatCard } from '@/components/data/DetailCards';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/lib/auth/AuthContext';
import { cashRegisterApi } from '@/lib/api/finance';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

export default function CashRegisterScreen() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [agency, setAgency] = useState({ id: user?.agencyIds?.[0] ?? '', name: '' });
  const [viewAll, setViewAll] = useState(false);
  const [movPage, setMovPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [showClose, setShowClose] = useState(false);

  const agencyId = agency.id;
  const { data: crData, refetch: refetchCr } = useQuery({ queryKey: ['cash-register', agencyId], queryFn: () => cashRegisterApi.get(agencyId), enabled: !!agencyId });
  const { data: movData, refetch: refetchMov } = useQuery({ queryKey: ['cash-register', agencyId, 'movements', movPage, viewAll], queryFn: () => cashRegisterApi.movements(agencyId, { page: movPage, limit: 20, all: viewAll ? 'true' : undefined }), enabled: !!agencyId });

  const cr = crData?.data ?? crData;
  const rawMov = movData?.data ?? movData;
  const movements: any[] = Array.isArray(rawMov) ? rawMov : (rawMov?.movements ?? rawMov?.data ?? []);
  const movMeta = movData?.meta ?? rawMov?.meta;
  const onRefresh = async () => { setRefreshing(true); await Promise.all([refetchCr(), refetchMov()]); setRefreshing(false); };

  const doClose = async () => {
    try { await cashRegisterApi.close(agencyId); toast.success('Caisse cloturee'); qc.invalidateQueries({ queryKey: ['cash-register', agencyId] }); }
    catch (e) { toast.error(extractApiError(e, 'Erreur')); }
    setShowClose(false);
  };

  const columns: Column<any>[] = [
    { key: 'direction', label: 'Type', width: 110, render: (m) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name={m.direction === 'IN' ? 'arrow-down-circle' : 'arrow-up-circle'} size={16} color={m.direction === 'IN' ? colors.primary[600] : colors.error} /><Text style={{ fontSize: 12, color: m.direction === 'IN' ? colors.primary[700] : colors.error }}>{m.direction === 'IN' ? 'Entree' : 'Sortie'}</Text></View> },
    { key: 'label', label: 'Operation', width: 200, render: (m) => <Text style={{ fontSize: 13, color: colors.gray[900], textDecorationLine: m.voided ? 'line-through' : 'none' }} numberOfLines={1}>{m.label}{m.voided ? ' (annule)' : ''}</Text> },
    { key: 'reference', label: 'Reference', width: 140, render: (m) => <Text style={{ fontFamily: 'monospace', fontSize: 11, color: colors.gray[400] }}>{m.reference ?? '-'}</Text> },
    { key: 'userName', label: 'Par', width: 130, render: (m) => <Text style={{ fontSize: 13 }}>{m.userName ?? '-'}</Text> },
    { key: 'date', label: 'Date', width: 150, render: (m) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{m.date ? formatDateTime(m.date) : '-'}</Text> },
    { key: 'amount', label: 'Montant', width: 130, align: 'right', render: (m) => <Text style={{ fontSize: 13, fontWeight: '700', color: m.direction === 'IN' ? colors.primary[700] : colors.error }}>{m.direction === 'IN' ? '+' : '-'}{formatAmount(Number(m.amount ?? 0))}</Text> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader title="Caisse Agence" subtitle="Suivi en temps reel de la caisse du jour" actions={cr && !cr.isClosed ? <HeaderAction label="Cloturer" icon="lock-closed-outline" variant="outline" onPress={() => setShowClose(true)} /> : undefined} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <AgencyPicker value={agency.id} name={agency.name} onChange={(id, nm) => { setAgency({ id, name: nm }); setMovPage(1); }} placeholder="Choisir une agence" />
          <Pressable onPress={() => { setViewAll((v) => !v); setMovPage(1); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name={viewAll ? 'checkbox' : 'square-outline'} size={20} color={viewAll ? colors.primary[600] : colors.gray[400]} />
            <Text style={{ fontSize: 13, color: colors.gray[600] }}>Tous les mouvements (toutes dates)</Text>
          </Pressable>
        </View>

        {!agencyId ? (
          <Card><Text style={{ fontSize: 14, color: colors.gray[400], textAlign: 'center', paddingVertical: 24 }}>Selectionnez une agence</Text></Card>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              <StatCard label="Solde d'ouverture" value={formatAmount(Number(cr?.openingBalance ?? 0))} />
              <StatCard label="Entrees du jour" value={`+${formatAmount(Number(cr?.totalEntries ?? 0))}`} color={colors.primary[600]} />
              <StatCard label="Sorties du jour" value={`-${formatAmount(Number(cr?.totalExits ?? 0))}`} color={colors.error} />
              <StatCard label="Solde actuel" value={formatAmount(Number(cr?.currentBalance ?? 0))} color={colors.primary[700]} hint={cr?.isClosed ? 'Cloturee' : 'Ouverte'} />
            </View>

            <Card padding="sm">
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.gray[900], padding: spacing.md }}>Historique des mouvements ({movMeta?.total ?? movements.length})</Text>
              <AppDataTable columns={columns} data={movements} page={movPage} totalPages={movMeta?.totalPages ?? 1} total={movMeta?.total} limit={20} onPageChange={setMovPage} emptyMessage="Aucun mouvement" />
            </Card>
          </>
        )}
      </ScrollView>

      <ConfirmDialog open={showClose} onClose={() => setShowClose(false)} onConfirm={doClose} title="Cloturer la caisse" message="La caisse du jour sera cloturee." confirmLabel="Cloturer" />
    </View>
  );
}
