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
import { useWarehouses, useDeleteWarehouse } from '@/lib/hooks/useWarehouses';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { WarehouseFormDialog } from './WarehouseFormDialog';

interface Warehouse {
  id: string;
  name: string;
  location?: string | null;
  agency?: { name?: string } | null;
  isActive?: boolean;
  _count?: { parcels?: number };
}

const exportColumns = [
  { key: 'name', label: 'Nom' },
  { key: 'location', label: 'Emplacement' },
  { key: 'agency', label: 'Agence' },
];

export default function WarehousesScreen() {
  const router = useRouter();
  const { page, limit, search, setPage, setSearch, queryParams } = useServerPagination();
  const [agencyId, setAgencyId] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [toDelete, setToDelete] = useState<Warehouse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const deleteMutation = useDeleteWarehouse();

  const { data, isLoading, refetch } = useWarehouses({ ...queryParams, agencyId: agencyId || undefined } as any);
  const warehouses: Warehouse[] = data?.data ?? [];
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
        await apiClient.post('/warehouses', {
          name: row.name || row.nom,
          agencyId: row.agencyid || row.agencyId,
          location: row.location || row.emplacement,
        });
        success++;
      } catch {
        /* skip */
      }
    }
    toast.success(`${success}/${rows.length} magasins importes`);
    refetch();
  };

  const exportData = warehouses.map((w) => ({ ...w, agency: w.agency?.name ?? '' }));

  const columns: Column<Warehouse>[] = [
    {
      key: 'name',
      label: 'Nom',
      width: 220,
      render: (row) => (
        <View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary[700] }} numberOfLines={1}>{row.name}</Text>
          {!!row.location && <Text style={{ fontSize: 12, color: colors.gray[400] }} numberOfLines={1}>{row.location}</Text>}
        </View>
      ),
    },
    { key: 'agency', label: 'Agence', width: 160, render: (row) => <Text style={{ fontSize: 13 }}>{row.agency?.name ?? '-'}</Text> },
    { key: '_count', label: 'Colis', width: 90, align: 'center', render: (row) => <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[700] }}>{row._count?.parcels ?? 0}</Text> },
    {
      key: 'isActive',
      label: 'Statut',
      width: 110,
      render: (row) => <Badge variant={row.isActive === false ? 'error' : 'success'}>{row.isActive === false ? 'Inactif' : 'Actif'}</Badge>,
    },
    {
      key: 'actions',
      label: '',
      width: 60,
      align: 'center',
      render: (row) => (
        <RowActions
          actions={[
            { label: 'Voir details', icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/warehouses/${row.id}`) },
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
          title="Magasins"
          subtitle={`${meta?.total ?? warehouses.length} magasins`}
          actions={
            <Can permission="warehouse.manage">
              <HeaderAction label="Importer" icon="cloud-upload-outline" variant="outline" onPress={() => setShowImport(true)} />
              <HeaderAction label="Nouveau magasin" icon="add" onPress={() => setShowCreate(true)} />
            </Can>
          }
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher un magasin..." />
          </View>
          <ExportButton data={exportData} columns={exportColumns} fileName="magasins" />
          <AgencyPicker value={agencyId} name={agencyName} onChange={(id, nm) => { setAgencyId(id); setAgencyName(nm); setPage(1); }} />
        </View>

        <Card padding="sm">
          <AppDataTable
            columns={columns}
            data={warehouses}
            isLoading={isLoading}
            page={page}
            totalPages={meta?.totalPages ?? 1}
            total={meta?.total}
            limit={limit}
            onPageChange={setPage}
            onRowClick={(row) => router.push(`/warehouses/${row.id}`)}
            emptyMessage="Aucun magasin"
          />
        </Card>
      </ScrollView>

      <WarehouseFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <CsvImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        title="Importer des magasins"
        requiredColumns={['name', 'agencyId', 'location']}
        columnLabels={{ name: 'Nom', agencyId: 'ID Agence', location: 'Emplacement' }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id, { onSuccess: () => setToDelete(null), onError: () => setToDelete(null) })}
        title="Supprimer le magasin"
        message={`Le magasin "${toDelete?.name}" sera desactive.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </View>
  );
}
