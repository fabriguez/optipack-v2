import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { AppTabs, type TabItem } from '@/components/ui/AppTabs';
import { Badge } from '@/components/ui/Badge';
import { HeaderAction } from '@/components/data/PageHeader';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { SectionCard, StatCard, InfoCard } from '@/components/data/DetailCards';
import { useClient } from '@/lib/hooks/useClients';
import { clientsApi } from '@/lib/api/clients';
import { apiClient } from '@/lib/api/client';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { ClientFormDialog } from './ClientFormDialog';
import { PartnerPricingSection } from './PartnerPricingSection';

const TIER_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success'> = {
  STANDARD: 'default', SILVER: 'info', GOLD: 'warning', VIP: 'success',
};
const SCORE: Record<string, { variant: 'success' | 'warning' | 'error'; label: string }> = {
  GOOD: { variant: 'success', label: 'Bon payeur' },
  RISKY: { variant: 'warning', label: 'Risque' },
  BAD: { variant: 'error', label: 'Mauvais payeur' },
};

const ic = (name: keyof typeof Ionicons.glyphMap) => <Ionicons name={name} size={15} color={colors.gray[500]} />;

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const clientId = String(id);
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useClient(clientId);
  const [showEdit, setShowEdit] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tabKey, setTabKey] = useState(0);
  useFocusEffect(useCallback(() => { setTabKey((k) => k + 1); }, []));

  const { data: outstandingData } = useQuery({ queryKey: ['clients', clientId, 'outstanding'], queryFn: () => clientsApi.outstanding(clientId), enabled: !!clientId });
  const { data: scoreData } = useQuery({ queryKey: ['clients', clientId, 'score'], queryFn: () => clientsApi.score(clientId), enabled: !!clientId });

  const c = data?.data;
  const outstanding = outstandingData?.data ?? outstandingData;
  const score = (scoreData?.data ?? scoreData)?.score as string | undefined;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        qc.invalidateQueries({ queryKey: ['clients', clientId] }),
        qc.invalidateQueries({ queryKey: ['parcels', 'client', clientId] }),
        qc.invalidateQueries({ queryKey: ['invoices', 'client', clientId] }),
        qc.invalidateQueries({ queryKey: ['debts', 'client', clientId] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!c) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Client introuvable</Text></View>;

  const tabs: TabItem[] = [
    { value: 'parcels', label: 'Colis', icon: ic('cube-outline'), content: <ParcelsTab clientId={clientId} /> },
    { value: 'invoices', label: 'Factures', icon: ic('document-text-outline'), content: <InvoicesTab clientId={clientId} /> },
    { value: 'debts', label: 'Dettes', icon: ic('alert-circle-outline'), content: <DebtsTab clientId={clientId} /> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
            <Pressable onPress={() => router.navigate('/clients')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: colors.gray[900] }}>{c.fullName}</Text>
                {c.clientType === 'PARTNER' && <Badge variant="success">Partenaire</Badge>}
                {c.clientType === 'COMPANY' && <Badge variant="info">Entreprise</Badge>}
                <Badge variant={TIER_VARIANT[c.loyaltyTier ?? 'STANDARD'] ?? 'default'}>{c.loyaltyTier ?? 'STANDARD'}</Badge>
                {score && SCORE[score] && <Badge variant={SCORE[score].variant}>{SCORE[score].label}</Badge>}
                {c.isActive === false && <Badge>Inactif</Badge>}
              </View>
              <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>{[c.phone, c.email].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>
          <HeaderAction label="Modifier" icon="create-outline" variant="outline" onPress={() => setShowEdit(true)} />
        </View>

        {/* Outstanding */}
        {!!outstanding && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            <StatCard label="Reste a payer total" value={formatAmount(Number(outstanding.totalOutstanding ?? 0))} color={Number(outstanding.totalOutstanding ?? 0) > 0 ? colors.error : colors.primary[600]} hint="factures + dettes" />
            <StatCard label="Factures impayees" value={formatAmount(Number(outstanding.invoiceOutstanding ?? 0))} hint={`${outstanding.unpaidInvoiceCount ?? 0} facture(s)`} />
            <StatCard label="Dettes actives" value={formatAmount(Number(outstanding.debtOutstanding ?? 0))} hint={`${outstanding.activeDebtCount ?? 0} dette(s)`} />
          </View>
        )}

        {/* Stats */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <InfoCard icon="star-outline" label="Points fidelite" value={String(c.loyaltyPoints ?? 0)} />
          <InfoCard icon="card-outline" label="Total depense" value={formatAmount(Number(c.totalSpent ?? 0))} />
          <InfoCard icon="calendar-outline" label="Inscrit le" value={c.createdAt ? formatDate(c.createdAt) : '-'} />
          <InfoCard icon="location-outline" label="Adresse" value={c.address || '-'} />
        </View>

        {/* Emergency contact */}
        {(c.emergencyContactName || c.emergencyContactPhone) && (
          <SectionCard title="Contact d'urgence">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              <InfoCard icon="person-outline" label="Nom" value={c.emergencyContactName || '-'} />
              <InfoCard icon="call-outline" label="Telephone" value={c.emergencyContactPhone || '-'} />
              <InfoCard icon="people-outline" label="Lien" value={c.emergencyContactRelation || '-'} />
            </View>
          </SectionCard>
        )}

        {/* Partner pricing */}
        <PartnerPricingSection clientId={clientId} isPartner={c.clientType === 'PARTNER'} />

        {/* Tabs */}
        <AppTabs key={tabKey} tabs={tabs} />
      </ScrollView>

      <ClientFormDialog open={showEdit} onClose={() => setShowEdit(false)} client={c} />
    </View>
  );
}

function ParcelsTab({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { data } = useQuery({ queryKey: ['parcels', 'client', clientId], queryFn: () => apiClient.get('/parcels', { params: { clientId, limit: 10 } }).then((r) => r.data), enabled: !!clientId });
  const rows: any[] = data?.data ?? [];
  const columns: Column<any>[] = [
    { key: 'trackingNumber', label: 'Tracking', width: 150, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{r.trackingNumber}</Text> },
    { key: 'designation', label: 'Designation', width: 180 },
    { key: 'price', label: 'Prix', width: 120, align: 'right', render: (r) => <Text style={{ fontSize: 13 }}>{formatAmount(Number(r.price ?? 0))}</Text> },
    { key: 'status', label: 'Statut', width: 120, render: (r) => <Badge>{r.status}</Badge> },
    { key: 'createdAt', label: 'Date', width: 130, render: (r) => <Text style={{ fontSize: 13, color: colors.gray[600] }}>{formatDate(r.createdAt)}</Text> },
  ];
  return (
    <SectionCard title={`Colis (${data?.meta?.total ?? rows.length})`}>
      <AppDataTable columns={columns} data={rows} emptyMessage="Aucun colis" onRowClick={(r) => router.push(`/parcels/${r.id}`)} />
    </SectionCard>
  );
}

function InvoicesTab({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { data } = useQuery({ queryKey: ['invoices', 'client', clientId], queryFn: () => apiClient.get('/invoices', { params: { clientId, limit: 10 } }).then((r) => r.data), enabled: !!clientId });
  const rows: any[] = data?.data ?? [];
  const columns: Column<any>[] = [
    { key: 'reference', label: 'Reference', width: 160, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{r.reference}</Text> },
    { key: 'netAmount', label: 'Montant net', width: 140, align: 'right', render: (r) => <Text style={{ fontSize: 13, fontWeight: '700' }}>{formatAmount(Number(r.netAmount ?? 0))}</Text> },
    { key: 'status', label: 'Statut', width: 120, render: (r) => <Badge variant={r.status === 'PAID' ? 'success' : 'warning'}>{r.status}</Badge> },
    { key: 'issuedAt', label: 'Date', width: 130, render: (r) => <Text style={{ fontSize: 13, color: colors.gray[600] }}>{r.issuedAt ? formatDate(r.issuedAt) : '-'}</Text> },
  ];
  return (
    <SectionCard title={`Factures (${data?.meta?.total ?? rows.length})`}>
      <AppDataTable columns={columns} data={rows} emptyMessage="Aucune facture" onRowClick={(r) => router.push(`/invoices/${r.id}`)} />
    </SectionCard>
  );
}

function DebtsTab({ clientId }: { clientId: string }) {
  const { data } = useQuery({ queryKey: ['debts', 'client', clientId], queryFn: () => apiClient.get('/debts', { params: { clientId, limit: 10 } }).then((r) => r.data), enabled: !!clientId });
  const rows: any[] = data?.data ?? [];
  const variant = (s: string) => (s === 'CLEARED' ? 'success' : s === 'OVERDUE' ? 'error' : s === 'PARTIALLY_PAID' ? 'info' : 'warning');
  const columns: Column<any>[] = [
    { key: 'description', label: 'Description', width: 220 },
    { key: 'totalAmount', label: 'Total', width: 130, align: 'right', render: (r) => <Text style={{ fontSize: 13 }}>{formatAmount(Number(r.totalAmount ?? 0))}</Text> },
    { key: 'remainingAmount', label: 'Restant', width: 130, align: 'right', render: (r) => <Text style={{ fontSize: 13, fontWeight: '700', color: colors.error }}>{formatAmount(Number(r.remainingAmount ?? 0))}</Text> },
    { key: 'status', label: 'Statut', width: 130, render: (r) => <Badge variant={variant(r.status)}>{r.status}</Badge> },
  ];
  return (
    <SectionCard title={`Dettes (${data?.meta?.total ?? rows.length})`}>
      <AppDataTable columns={columns} data={rows} emptyMessage="Aucune dette" />
    </SectionCard>
  );
}
