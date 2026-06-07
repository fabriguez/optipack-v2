import { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Modal, FlatList, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { formatAmount } from '@transitsoftservices/shared';
import { PageHeader } from '@/components/data/PageHeader';
import { ExportButton, type ExportColumn } from '@/components/data/ExportButton';
import { SearchBar } from '@/components/data/SearchBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { reportsApi, type ReportParams } from '@/lib/api/config';
import { useAgencies } from '@/lib/hooks/useAgencies';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

type ReportType = 'parcels' | 'payments' | 'revenue' | 'debts' | 'cash-flow' | 'penalties';

interface ReportConfig {
  id: ReportType;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const REPORTS: ReportConfig[] = [
  { id: 'parcels', title: 'Colis', description: 'Statistiques et liste des colis par periode', icon: 'cube-outline' },
  { id: 'payments', title: 'Paiements', description: 'Historique des paiements par agence', icon: 'document-text-outline' },
  { id: 'revenue', title: 'Revenus', description: "Chiffre d'affaires par agence et periode", icon: 'bar-chart-outline' },
  { id: 'debts', title: 'Dettes', description: 'Clients debiteurs et soldes restants', icon: 'alert-circle-outline' },
  { id: 'cash-flow', title: 'Tresorerie', description: 'Flux: entrees, sorties, solde', icon: 'wallet-outline' },
  { id: 'penalties', title: 'Penalites', description: 'Penalites appliquees, payees et impayees', icon: 'hourglass-outline' },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function ReportsScreen() {
  const [startDate, setStartDate] = useState(isoDaysAgo(30));
  const [endDate, setEndDate] = useState(isoDaysAgo(0));
  const [agencyId, setAgencyId] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [activeReport, setActiveReport] = useState<ReportType | null>(null);

  const params: ReportParams = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    agencyId: agencyId || undefined,
  } as ReportParams;

  const { data: reportData, isFetching, refetch } = useQuery({
    queryKey: ['report', activeReport, params],
    queryFn: () => {
      if (!activeReport) return null;
      const fn = activeReport === 'cash-flow' ? reportsApi.cashFlow : reportsApi[activeReport];
      return fn(params);
    },
    enabled: !!activeReport,
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (activeReport) await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const report = reportData?.data;

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
      >
        <PageHeader title="Rapports" subtitle="Generation et export de rapports" />

        {/* Filtres */}
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.lg }}>
            <Field label="Date debut">
              <DateBox value={startDate} onChange={setStartDate} />
            </Field>
            <Field label="Date fin">
              <DateBox value={endDate} onChange={setEndDate} />
            </Field>
            <Field label="Agence">
              <AgencyPicker
                value={agencyId}
                name={agencyName}
                onChange={(id, nm) => {
                  setAgencyId(id);
                  setAgencyName(nm);
                }}
              />
            </Field>
          </View>
        </Card>

        {/* Cartes rapports */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
          {REPORTS.map((r) => (
            <ReportCard
              key={r.id}
              config={r}
              isActive={activeReport === r.id}
              isLoading={isFetching && activeReport === r.id}
              summary={activeReport === r.id ? report?.summary : null}
              details={activeReport === r.id ? report?.details : null}
              onGenerate={() => setActiveReport(r.id)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[700] }}>{label}</Text>
      {children}
    </View>
  );
}

function DateBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="AAAA-MM-JJ"
      placeholderTextColor={colors.gray[400]}
      style={{ width: 150, height: 44, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 14, color: colors.gray[900], backgroundColor: colors.white }}
    />
  );
}

function AgencyPicker({ value, name, onChange }: { value: string; name: string; onChange: (id: string, name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data } = useAgencies({ search: search || undefined, limit: 20 } as any);
  const agencies: any[] = data?.data ?? [];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ width: 240, height: 44, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white }}
      >
        <Text style={{ fontSize: 14, color: value ? colors.gray[900] : colors.gray[400] }} numberOfLines={1}>
          {value ? name : 'Toutes les agences'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.gray[400]} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing['2xl'] }} onPress={() => setOpen(false)}>
          <Pressable style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl, maxHeight: '70%', gap: spacing.md }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher une agence..." />
            <Pressable onPress={() => { onChange('', ''); setOpen(false); }} style={{ paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.md }}>
              <Text style={{ fontSize: 14, color: colors.gray[600] }}>Toutes les agences</Text>
            </Pressable>
            <FlatList
              data={agencies}
              keyExtractor={(a) => a.id}
              nestedScrollEnabled
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { onChange(item.id, item.name); setOpen(false); }}
                  style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: pressed ? colors.gray[50] : 'transparent' })}
                >
                  <Text style={{ fontSize: 14, color: colors.gray[900] }}>{item.name}</Text>
                  {!!item.city && <Text style={{ fontSize: 12, color: colors.gray[400] }}>{item.city}</Text>}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function ReportCard({
  config,
  isActive,
  isLoading,
  summary,
  details,
  onGenerate,
}: {
  config: ReportConfig;
  isActive: boolean;
  isLoading: boolean;
  summary: any;
  details: any;
  onGenerate: () => void;
}) {
  const exportData = getExportData(config.id, details);
  const exportColumns = getExportColumns(config.id);

  return (
    <Card style={{ flex: 1, minWidth: 280, borderWidth: isActive ? 2 : 0, borderColor: colors.primary[200] }}>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={config.icon} size={20} color={colors.primary[600]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{config.title}</Text>
            <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 2 }}>{config.description}</Text>
          </View>
        </View>

        {isActive && isLoading && (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.gray[100], paddingTop: spacing.md, gap: spacing.sm }}>
            <Skeleton style={{ height: 16, width: '75%' }} />
            <Skeleton style={{ height: 16, width: '50%' }} />
          </View>
        )}

        {isActive && summary && !isLoading && (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.gray[100], paddingTop: spacing.md }}>
            <SummaryDisplay reportId={config.id} summary={summary} />
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button size="sm" loading={isLoading} onPress={onGenerate}>Generer</Button>
          {isActive && exportData.length > 0 && (
            <ExportButton data={exportData} columns={exportColumns} fileName={`rapport-${config.id}`} />
          )}
        </View>
      </View>
    </Card>
  );
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={{ flex: 1, minWidth: '45%', backgroundColor: colors.gray[50], borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
      <Text style={{ fontSize: 11, color: colors.gray[500] }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{value}</Text>
    </View>
  );
}

function SummaryDisplay({ reportId, summary }: { reportId: ReportType; summary: any }) {
  const grid = (items: { label: string; value: string | number }[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {items.map((it) => (
        <StatItem key={it.label} label={it.label} value={it.value} />
      ))}
    </View>
  );

  switch (reportId) {
    case 'parcels':
      return grid([
        { label: 'Total colis', value: summary.totalCount ?? 0 },
        { label: 'Poids total', value: `${summary.totalWeight ?? 0} kg` },
        { label: 'CA total', value: formatAmount(summary.totalRevenue ?? 0) },
        { label: 'Statuts', value: `${summary.byStatus?.length || 0} types` },
      ]);
    case 'payments':
      return grid([
        { label: 'Montant total', value: formatAmount(summary.totalAmount ?? 0) },
        { label: 'Nombre', value: summary.count ?? 0 },
        { label: 'Remises', value: formatAmount(summary.totalDiscount ?? 0) },
        { label: 'TVA', value: formatAmount(summary.totalTva ?? 0) },
      ]);
    case 'revenue':
      return grid([
        { label: 'CA total', value: formatAmount(summary.totalRevenue ?? 0) },
        { label: 'Agences', value: summary.agencyCount ?? 0 },
      ]);
    case 'debts':
      return grid([
        { label: 'Total dettes', value: formatAmount(summary.totalDebt ?? 0) },
        { label: 'Clients', value: summary.clientCount ?? 0 },
        { label: 'Nombre dettes', value: summary.debtCount ?? 0 },
      ]);
    case 'cash-flow':
      return grid([
        { label: 'Entrees', value: formatAmount(summary.totalEntries ?? 0) },
        { label: 'Sorties', value: formatAmount(summary.totalExits ?? 0) },
        { label: 'Decaissements', value: formatAmount(summary.totalDisbursements ?? 0) },
        { label: 'Solde net', value: formatAmount(summary.netCashFlow ?? 0) },
      ]);
    case 'penalties':
      return grid([
        { label: 'Montant total', value: formatAmount(summary.totalAmount ?? 0) },
        { label: 'Nombre', value: summary.totalCount ?? 0 },
        { label: 'Payees', value: `${summary.paid?.count || 0} (${formatAmount(summary.paid?.amount || 0)})` },
        { label: 'Impayees', value: `${summary.unpaid?.count || 0} (${formatAmount(summary.unpaid?.amount || 0)})` },
      ]);
    default:
      return null;
  }
}

function getExportColumns(reportId: ReportType): ExportColumn[] {
  switch (reportId) {
    case 'parcels':
      return [
        { key: 'trackingNumber', label: 'Tracking' },
        { key: 'status', label: 'Statut' },
        { key: 'weight', label: 'Poids (kg)' },
        { key: 'price', label: 'Prix' },
        { key: 'client', label: 'Client' },
        { key: 'warehouse', label: 'Entrepot' },
      ];
    case 'payments':
      return [
        { key: 'reference', label: 'Reference' },
        { key: 'amount', label: 'Montant' },
        { key: 'paymentMethod', label: 'Mode' },
        { key: 'agency', label: 'Agence' },
        { key: 'createdAt', label: 'Date' },
      ];
    case 'revenue':
      return [
        { key: 'agencyName', label: 'Agence' },
        { key: 'agencyCode', label: 'Code' },
        { key: 'totalAmount', label: 'Montant total' },
        { key: 'totalDiscount', label: 'Remises' },
        { key: 'count', label: 'Nombre paiements' },
      ];
    case 'debts':
      return [
        { key: 'clientName', label: 'Client' },
        { key: 'clientPhone', label: 'Telephone' },
        { key: 'totalAmount', label: 'Montant total' },
        { key: 'remainingAmount', label: 'Restant' },
        { key: 'debtCount', label: 'Nombre dettes' },
      ];
    case 'cash-flow':
      return [
        { key: 'type', label: 'Type' },
        { key: 'amount', label: 'Montant' },
        { key: 'count', label: 'Nombre' },
      ];
    case 'penalties':
      return [
        { key: 'client', label: 'Client' },
        { key: 'parcel', label: 'Colis' },
        { key: 'totalAmount', label: 'Montant' },
        { key: 'daysAccumulated', label: 'Jours' },
        { key: 'isPaid', label: 'Payee' },
        { key: 'agency', label: 'Agence' },
      ];
    default:
      return [];
  }
}

function getExportData(reportId: ReportType, details: any): Record<string, any>[] {
  if (!details) return [];
  switch (reportId) {
    case 'parcels':
      return Array.isArray(details) ? details.map((p: any) => ({ ...p, client: p.client?.fullName || '', warehouse: p.warehouse?.name || '' })) : [];
    case 'payments':
      return Array.isArray(details) ? details.map((p: any) => ({ ...p, agency: p.agency?.name || '' })) : [];
    case 'revenue':
    case 'debts':
      return Array.isArray(details) ? details : [];
    case 'cash-flow':
      if (details && typeof details === 'object' && !Array.isArray(details)) {
        return Object.entries(details).map(([key, val]: [string, any]) => ({ type: key, amount: val.amount, count: val.count }));
      }
      return [];
    case 'penalties':
      return Array.isArray(details)
        ? details.map((p: any) => ({ ...p, client: p.client?.fullName || '', parcel: p.parcel?.trackingNumber || '', agency: p.agency?.name || '', isPaid: p.isPaid ? 'Oui' : 'Non' }))
        : [];
    default:
      return [];
  }
}
