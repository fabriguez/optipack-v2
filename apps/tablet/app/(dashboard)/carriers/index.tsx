import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import { useCarriers, useDeleteCarrier } from '@/lib/hooks/useCarriers';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { CarrierFormDialog } from './CarrierFormDialog';

interface Carrier {
  id: string;
  name: string;
  contactName?: string | null;
  carrierType?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive?: boolean;
  client?: { id?: string; fullName?: string } | null;
}

const TYPE_LABEL: Record<string, string> = { AIR: 'Aerien', SEA: 'Maritime', LAND: 'Terrestre', MULTI: 'Multi-modal' };

const exportColumns = [
  { key: 'name', label: 'Nom' }, { key: 'contactName', label: 'Contact' },
  { key: 'phone', label: 'Telephone' }, { key: 'email', label: 'Email' },
  { key: 'carrierType', label: 'Type' }, { key: 'address', label: 'Adresse' },
];

export default function CarriersScreen() {
  const router = useRouter();
  const { page, limit, search, setPage, setSearch, queryParams } = useServerPagination();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Carrier | null>(null);
  const [toDelete, setToDelete] = useState<Carrier | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const del = useDeleteCarrier();

  const { data, isLoading, refetch } = useCarriers(queryParams as any);
  const carriers: Carrier[] = data?.data ?? [];
  const meta = data?.meta;

  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const columns: Column<Carrier>[] = [
    {
      key: 'name', label: 'Nom', width: 200,
      render: (r) => (
        <View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary[700] }}>{r.name}</Text>
          {!!r.contactName && <Text style={{ fontSize: 12, color: colors.gray[400] }}>{r.contactName}</Text>}
        </View>
      ),
    },
    { key: 'carrierType', label: 'Type', width: 120, render: (r) => <Badge>{TYPE_LABEL[r.carrierType ?? ''] ?? r.carrierType ?? '-'}</Badge> },
    { key: 'phone', label: 'Telephone', width: 150, render: (r) => <Text style={{ fontSize: 13 }}>{r.phone || '-'}</Text> },
    { key: 'email', label: 'Email', width: 180, render: (r) => <Text style={{ fontSize: 13 }}>{r.email || '-'}</Text> },
    { key: 'client', label: 'Client associe', width: 160, render: (r) => <Text style={{ fontSize: 13 }}>{r.client?.fullName ?? '-'}</Text> },
    { key: 'isActive', label: 'Statut', width: 100, render: (r) => <Badge variant={r.isActive === false ? 'error' : 'success'}>{r.isActive === false ? 'Inactif' : 'Actif'}</Badge> },
    {
      key: 'actions', label: '', width: 60, align: 'center',
      render: (r) => (
        <RowActions actions={[
          { label: 'Voir', icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/carriers/${r.id}`) },
          { label: 'Modifier', icon: <Ionicons name="create-outline" size={18} color={colors.gray[700]} />, onPress: () => setEditTarget(r) },
          { label: 'Desactiver', icon: <Ionicons name="trash-outline" size={18} color={colors.error} />, onPress: () => setToDelete(r), variant: 'destructive', disabled: r.isActive === false },
        ]} />
      ),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader
          title="Transporteurs"
          subtitle={`${meta?.total ?? carriers.length} transporteur(s)`}
          actions={<Can permission="carrier.manage"><HeaderAction label="Nouveau transporteur" icon="add" onPress={() => setShowCreate(true)} /></Can>}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}><SearchBar value={search} onChange={setSearch} placeholder="Rechercher par nom..." /></View>
          <ExportButton data={carriers} columns={exportColumns} fileName="transporteurs" />
        </View>

        <Card padding="sm">
          <AppDataTable columns={columns} data={carriers} isLoading={isLoading} page={page} totalPages={meta?.totalPages ?? 1} total={meta?.total} limit={limit} onPageChange={setPage} onRowClick={(r) => router.push(`/carriers/${r.id}`)} emptyMessage="Aucun transporteur" />
        </Card>
      </ScrollView>

      <CarrierFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <CarrierFormDialog open={!!editTarget} onClose={() => setEditTarget(null)} carrier={editTarget ?? undefined} />
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null), onError: () => setToDelete(null) })} title="Desactiver le transporteur" message={`"${toDelete?.name}" sera desactive.`} confirmLabel="Desactiver" variant="destructive" loading={del.isPending} />
    </View>
  );
}
