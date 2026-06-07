import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, HeaderAction } from '@/components/data/PageHeader';
import { SearchBar } from '@/components/data/SearchBar';
import { ExportButton } from '@/components/data/ExportButton';
import { FilterDialog } from '@/components/data/FilterDialog';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { RowActions } from '@/components/data/RowActions';
import { CsvImportDialog } from '@/components/data/CsvImportDialog';
import { AgencyAvatar } from '@/components/shared/AgencyAvatar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Can } from '@/components/auth/Can';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { useAgencies, useDeleteAgency } from '@/lib/hooks/useAgencies';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { AgencyFormDialog } from './AgencyFormDialog';

interface Agency {
  id: string;
  code?: string;
  name: string;
  city?: string | null;
  country?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive?: boolean;
  _count?: { warehouses?: number };
}

const exportColumns = [
  { key: 'code', label: 'Code' },
  { key: 'name', label: 'Nom' },
  { key: 'city', label: 'Ville' },
  { key: 'country', label: 'Pays' },
  { key: 'phone', label: 'Telephone' },
  { key: 'email', label: 'Email' },
];

const filterFields = [
  { key: 'city', label: 'Ville', placeholder: 'Ex: Douala' },
  { key: 'country', label: 'Pays', placeholder: 'Ex: Cameroun' },
];

export default function AgenciesScreen() {
  const router = useRouter();
  const { page, limit, search, filters, setPage, setSearch, setManyFilters, clearFilters, queryParams } =
    useServerPagination();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [toDelete, setToDelete] = useState<Agency | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const deleteMutation = useDeleteAgency();

  const { data, isLoading, refetch } = useAgencies(queryParams as any);
  const agencies: Agency[] = data?.data ?? [];
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
        await apiClient.post('/agencies', {
          name: row.name || row.nom,
          address: row.address || row.adresse,
          city: row.city || row.ville,
          country: row.country || row.pays,
          phone: row.phone || row.telephone,
          email: row.email || '',
        });
        success++;
      } catch {
        /* skip failed */
      }
    }
    toast.success(`${success}/${rows.length} agences importees`);
    refetch();
  };

  const columns: Column<Agency>[] = [
    {
      key: 'code',
      label: 'Code',
      width: 150,
      render: (row) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AgencyAvatar agency={row} size={36} rounded="lg" />
          <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>
            {row.code ?? '-'}
          </Text>
        </View>
      ),
    },
    {
      key: 'name',
      label: 'Nom',
      width: 200,
      render: (row) => (
        <View>
          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[900] }} numberOfLines={1}>
            {row.name}
          </Text>
          {!!row.address && (
            <Text style={{ fontSize: 12, color: colors.gray[400] }} numberOfLines={1}>
              {row.address}
            </Text>
          )}
        </View>
      ),
    },
    { key: 'city', label: 'Ville', width: 130 },
    { key: 'country', label: 'Pays', width: 130 },
    { key: 'phone', label: 'Telephone', width: 150 },
    {
      key: 'isActive',
      label: 'Statut',
      width: 110,
      render: (row) => (
        <Badge variant={row.isActive === false ? 'error' : 'success'}>
          {row.isActive === false ? 'Inactif' : 'Actif'}
        </Badge>
      ),
    },
    {
      key: '_count',
      label: 'Magasins',
      width: 100,
      align: 'center',
      render: (row) => (
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[700] }}>
          {row._count?.warehouses ?? 0}
        </Text>
      ),
    },
    {
      key: 'actions',
      label: '',
      width: 60,
      align: 'center',
      render: (row) => (
        <RowActions
          actions={[
            {
              label: 'Voir',
              icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />,
              onPress: () => router.push(`/agencies/${row.id}`),
            },
            {
              label: 'Supprimer',
              icon: <Ionicons name="trash-outline" size={18} color={colors.error} />,
              onPress: () => setToDelete(row),
              variant: 'destructive',
            },
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
          title="Agences"
          subtitle={`${meta?.total ?? agencies.length} agences`}
          actions={
            <Can permission="agency.manage">
              <HeaderAction label="Importer" icon="cloud-upload-outline" variant="outline" onPress={() => setShowImport(true)} />
              <HeaderAction label="Nouvelle agence" icon="add" onPress={() => setShowCreate(true)} />
            </Can>
          }
        />

        {/* Recherche + Export + Filtres */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher par nom, ville, code..." />
          </View>
          <ExportButton data={agencies} columns={exportColumns} fileName="agences" />
          <FilterDialog fields={filterFields} values={filters} onApply={setManyFilters} onClear={clearFilters} />
        </View>

        <Card padding="sm">
          <AppDataTable
            columns={columns}
            data={agencies}
            isLoading={isLoading}
            page={page}
            totalPages={meta?.totalPages ?? 1}
            total={meta?.total}
            limit={limit}
            onPageChange={setPage}
            onRowClick={(row) => router.push(`/agencies/${row.id}`)}
            emptyMessage="Aucune agence"
          />
        </Card>
      </ScrollView>

      <AgencyFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <CsvImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        title="Importer des agences"
        requiredColumns={['name', 'address', 'city', 'country', 'phone']}
        columnLabels={{ name: 'Nom', address: 'Adresse', city: 'Ville', country: 'Pays', phone: 'Telephone', email: 'Email' }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (!toDelete) return;
          deleteMutation.mutate(toDelete.id, {
            onSuccess: () => setToDelete(null),
            onError: () => setToDelete(null),
          });
        }}
        title="Supprimer l'agence"
        message={`L'agence "${toDelete?.name}" sera desactivee. Vous pourrez la reactiver plus tard.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </View>
  );
}
