import { Suspense, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Plus, Upload, Eye, Edit, Trash2 } from 'lucide-react';
import { AgencyAvatar } from '@/components/shared/AgencyAvatar';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { CsvImportDialog } from '@/components/shared/CsvImportDialog';
import { RowActions } from '@/components/shared/RowActions';
import { Can } from '@/lib/components/Can';
import { usePermission } from '@/lib/hooks/usePermission';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { useAgencies, useDeleteAgency } from '@/lib/hooks/useAgencies';
import { AgencyFormDialog } from './AgencyFormDialog';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

function AgenciesContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { page, search, setPage, setSearch, queryParams } = useServerPagination();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const deleteMutation = useDeleteAgency();
  // Permission ABAC : creation/suppression d'agence = agency.manage
  const canManageAgency = usePermission('agency.manage');

  const cityFilter = searchParams.get('city') || '';
  const countryFilter = searchParams.get('country') || '';

  const { data, isLoading } = useAgencies({
    ...queryParams,
    city: cityFilter || undefined,
    country: countryFilter || undefined,
  } as any);

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
      } catch { /* skip failed */ }
    }
    toast.success(`${success}/${rows.length} agences importees`);
  };

  const exportColumns = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Nom' },
    { key: 'city', label: 'Ville' },
    { key: 'country', label: 'Pays' },
    { key: 'phone', label: 'Telephone' },
    { key: 'email', label: 'Email' },
  ];

  const filterFields = [
    { key: 'city', label: 'Ville', type: 'text' as const },
    { key: 'country', label: 'Pays', type: 'text' as const },
  ];

  const columns = [
    {
      key: 'code',
      label: 'Code',
      render: (row: any) => (
        <div className="flex items-center gap-2.5">
          <AgencyAvatar agency={row} size={36} rounded="lg" />
          <Link to={`/agencies/${row.id}`} className="font-mono text-xs font-bold text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>{row.code}</Link>
        </div>
      ),
    },
    {
      key: 'name',
      label: 'Nom',
      render: (row: any) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-400">{row.address}</p>
        </div>
      ),
    },
    { key: 'city', label: 'Ville' },
    { key: 'country', label: 'Pays' },
    { key: 'phone', label: 'Telephone' },
    {
      key: 'isActive',
      label: 'Statut',
      render: (row: any) => <AppBadge variant={row.isActive ? 'success' : 'error'}>{row.isActive ? 'Actif' : 'Inactif'}</AppBadge>,
    },
    {
      key: '_count',
      label: 'Magasins',
      render: (row: any) => <span className="text-sm font-medium">{row._count?.warehouses ?? 0}</span>,
    },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions
          actions={[
            { label: 'Voir', icon: <Eye className="h-4 w-4" />, onClick: () => navigate(`/agencies/${row.id}`) },
            { label: 'Modifier', icon: <Edit className="h-4 w-4" />, onClick: () => navigate(`/agencies/${row.id}`) },
            ...(canManageAgency ? [{ label: 'Supprimer', icon: <Trash2 className="h-4 w-4" />, onClick: () => deleteMutation.mutate(row.id), variant: 'destructive' as const }] : []),
          ]}
        />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agences</h1>
            <p className="text-sm text-gray-500 mt-1">{data?.meta?.total ?? 0} agences</p>
          </div>
          <div className="flex gap-2">
            <Can permission="agency.manage">
              <AppButton variant="outline" onClick={() => setShowImport(true)}>
                <Upload className="h-4 w-4" />
                Importer
              </AppButton>
              <AppButton onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />
                Nouvelle agence
              </AppButton>
            </Can>
          </div>
        </div>

        {/* Search --- Export | Filtres | Effacer */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher par nom, ville, code..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="agences" />
            <FilterDialog fields={filterFields} />
          </div>
        </div>

        <AppCard padding="sm">
          <AppDataTable
            columns={columns}
            data={data?.data || []}
            isLoading={isLoading}
            page={page}
            totalPages={data?.meta?.totalPages || 1}
            total={data?.meta?.total}
            limit={queryParams.limit}
            onPageChange={setPage}
            onRowClick={(row) => navigate(`/agencies/${row.id}`)}
          />
        </AppCard>

        <AgencyFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
        <CsvImportDialog
          open={showImport}
          onClose={() => setShowImport(false)}
          onImport={handleImport}
          title="Importer des agences"
          requiredColumns={['name', 'address', 'city', 'country', 'phone']}
          columnLabels={{ name: 'Nom', address: 'Adresse', city: 'Ville', country: 'Pays', phone: 'Telephone', email: 'Email' }}
        />
      </div>
    </PageTransition>
  );
}

export default function AgenciesPage() {
  return <Suspense><AgenciesContent /></Suspense>;
}
