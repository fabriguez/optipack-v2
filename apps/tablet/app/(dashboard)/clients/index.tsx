import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, HeaderAction } from '@/components/data/PageHeader';
import { SearchBar } from '@/components/data/SearchBar';
import { ExportButton } from '@/components/data/ExportButton';
import { AgencyPicker } from '@/components/data/AgencyPicker';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { RowActions } from '@/components/data/RowActions';
import { CsvImportDialog } from '@/components/data/CsvImportDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Can } from '@/components/auth/Can';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { useClients, useDeleteClient } from '@/lib/hooks/useClients';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { formatAmount } from '@transitsoftservices/shared';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { ClientFormDialog } from './ClientFormDialog';

interface Client {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  clientType?: string | null;
  loyaltyTier?: string | null;
  loyaltyPoints?: number;
  totalSpent?: number;
  agency?: { name?: string } | null;
  employee?: { id?: string } | null;
  carrier?: { id?: string } | null;
  _count?: { parcels?: number };
}

const TIER_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success'> = {
  STANDARD: 'default', SILVER: 'info', GOLD: 'warning', VIP: 'success',
};

const exportColumns = [
  { key: 'fullName', label: 'Nom' },
  { key: 'phone', label: 'Telephone' },
  { key: 'email', label: 'Email' },
  { key: 'loyaltyTier', label: 'Fidelite' },
  { key: 'loyaltyPoints', label: 'Points' },
  { key: 'totalSpent', label: 'Total depense' },
];

export default function ClientsScreen() {
  const router = useRouter();
  const { page, limit, search, setPage, setSearch, queryParams } = useServerPagination();
  const [agencyId, setAgencyId] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [toDelete, setToDelete] = useState<Client | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const deleteMutation = useDeleteClient();

  const { data, isLoading, refetch } = useClients({ ...queryParams, agencyId: agencyId || undefined } as any);
  const clients: Client[] = data?.data ?? [];
  const meta = data?.meta;

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    for (const row of rows) {
      try {
        await apiClient.post('/clients', { fullName: row.fullname || row.nom || row.fullName, phone: row.phone || row.telephone, email: row.email || undefined });
        success++;
      } catch { /* skip */ }
    }
    toast.success(`${success}/${rows.length} clients importes`);
    refetch();
  };

  const columns: Column<Client>[] = [
    {
      key: 'fullName',
      label: 'Client',
      width: 220,
      render: (row) => (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary[700] }} numberOfLines={1}>{row.fullName}</Text>
            {row.employee?.id && <Badge variant="info">Employe</Badge>}
            {row.carrier?.id && <Badge variant="warning">Transporteur</Badge>}
          </View>
          {!!row.phone && <Text style={{ fontSize: 12, color: colors.gray[400] }}>{row.phone}</Text>}
        </View>
      ),
    },
    { key: 'email', label: 'Email', width: 180, render: (r) => <Text style={{ fontSize: 13 }}>{r.email || '-'}</Text> },
    { key: 'agency', label: 'Agence', width: 140, render: (r) => <Text style={{ fontSize: 13 }}>{r.agency?.name ?? '-'}</Text> },
    { key: 'loyaltyTier', label: 'Fidelite', width: 110, render: (r) => <Badge variant={TIER_VARIANT[r.loyaltyTier ?? 'STANDARD'] ?? 'default'}>{r.loyaltyTier ?? 'STANDARD'}</Badge> },
    { key: 'loyaltyPoints', label: 'Points', width: 80, align: 'center', render: (r) => <Text style={{ fontSize: 13 }}>{r.loyaltyPoints ?? 0}</Text> },
    { key: 'totalSpent', label: 'Total depense', width: 140, align: 'right', render: (r) => <Text style={{ fontSize: 13, fontWeight: '700' }}>{formatAmount(Number(r.totalSpent ?? 0))}</Text> },
    { key: '_count', label: 'Colis', width: 80, align: 'center', render: (r) => <Text style={{ fontSize: 13 }}>{r._count?.parcels ?? 0}</Text> },
    {
      key: 'actions',
      label: '',
      width: 60,
      align: 'center',
      render: (row) => (
        <RowActions
          actions={[
            { label: 'Voir le profil', icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/clients/${row.id}`) },
            { label: 'Modifier', icon: <Ionicons name="create-outline" size={18} color={colors.gray[700]} />, onPress: () => setEditClient(row) },
            { label: 'Supprimer', icon: <Ionicons name="trash-outline" size={18} color={colors.error} />, onPress: () => setToDelete(row), variant: 'destructive' },
          ]}
        />
      ),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
      >
        <PageHeader
          title="Clients"
          subtitle={`${meta?.total ?? clients.length} clients`}
          actions={
            <Can permission="client.create">
              <HeaderAction label="KYC" icon="shield-checkmark-outline" variant="outline" onPress={() => router.push('/clients/kyc')} />
              <HeaderAction label="Importer" icon="cloud-upload-outline" variant="outline" onPress={() => setShowImport(true)} />
              <HeaderAction label="Nouveau client" icon="add" onPress={() => setShowCreate(true)} />
            </Can>
          }
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Nom, telephone, email..." />
          </View>
          <ExportButton data={clients} columns={exportColumns} fileName="clients" />
          <AgencyPicker value={agencyId} name={agencyName} onChange={(id, nm) => { setAgencyId(id); setAgencyName(nm); setPage(1); }} />
        </View>

        <Card padding="sm">
          <AppDataTable
            columns={columns}
            data={clients}
            isLoading={isLoading}
            page={page}
            totalPages={meta?.totalPages ?? 1}
            total={meta?.total}
            limit={limit}
            onPageChange={setPage}
            onRowClick={(row) => router.push(`/clients/${row.id}`)}
            emptyMessage="Aucun client"
          />
        </Card>
      </ScrollView>

      <ClientFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <ClientFormDialog open={!!editClient} onClose={() => setEditClient(null)} client={editClient ?? undefined} />
      <CsvImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        title="Importer des clients"
        requiredColumns={['fullName', 'phone']}
        columnLabels={{ fullName: 'Nom', phone: 'Telephone', email: 'Email' }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id, { onSuccess: () => setToDelete(null), onError: () => setToDelete(null) })}
        title="Supprimer le client"
        message={`Le client "${toDelete?.fullName}" sera supprime. L'historique est conserve pour l'audit.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </View>
  );
}
