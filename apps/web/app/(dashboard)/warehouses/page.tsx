'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Upload, Eye, Power, PowerOff } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppBadge } from '@/components/ui/AppBadge';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { CsvImportDialog } from '@/components/shared/CsvImportDialog';
import { RowActions } from '@/components/shared/RowActions';
import { searchers } from '@/lib/api/searchers';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import { WarehouseFormDialog } from './WarehouseFormDialog';
import { Can } from '@/lib/components/Can';
import { useAgencyIds, useIsTenantAdmin, usePermission } from '@/lib/hooks/usePermission';

export default function WarehousesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const agencyIdFilter = searchParams.get('agencyId') || '';
  const isAdmin = useIsTenantAdmin();
  const agencyIds = useAgencyIds();
  const qc = useQueryClient();
  // Permission ABAC : activation / desactivation d'un magasin.
  const canManageWarehouse = usePermission('warehouse.manage');
  // Employe d'une seule agence : verrouille la creation au magasin de son agence.
  const singleUserAgencyId = !isAdmin && agencyIds.length === 1 ? agencyIds[0] : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['warehouses', agencyIdFilter, page, search],
    queryFn: () => apiClient.get('/warehouses', {
      params: {
        page,
        limit: 20,
        search: search || undefined,
        agencyId: agencyIdFilter || undefined,
      },
    }).then((r) => r.data),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/warehouses/${id}`, { isActive }).then((r) => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success(vars.isActive ? 'Magasin active' : 'Magasin desactive');
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message || 'Erreur lors de la mise a jour'),
  });

  const handleImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    for (const row of rows) {
      try {
        await apiClient.post('/warehouses', {
          name: row.name,
          agencyId: row.agencyId,
          location: row.location,
        });
        success++;
      } catch { /* skip */ }
    }
    toast.success(`${success}/${rows.length} magasins importes`);
  };

  const exportColumns = [
    { key: 'name', label: 'Nom' },
    { key: 'location', label: 'Emplacement' },
    { key: 'agency', label: 'Agence' },
  ];

  const filterFields = [
    {
      key: 'agencyId',
      label: 'Agence',
      type: 'search-select' as const,
      searcher: searchers.agencies,
    },
  ];

  const columns = [
    { key: 'name', label: 'Nom', render: (row: any) => <Link href={`/warehouses/${row.id}`} className="text-primary-700 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{row.name}</Link> },
    { key: 'location', label: 'Emplacement' },
    { key: 'agency', label: 'Agence', render: (row: any) => <span className="text-sm">{row.agency?.name || '-'}</span> },
    { key: '_count', label: 'Colis', render: (row: any) => row._count?.parcels ?? 0 },
    { key: 'isActive', label: 'Statut', render: (row: any) => <AppBadge variant={row.isActive ? 'success' : 'error'}>{row.isActive ? 'Actif' : 'Inactif'}</AppBadge> },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions actions={[
          { label: 'Voir details', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/warehouses/${row.id}`) },
          ...(canManageWarehouse ? [{
            label: row.isActive ? 'Desactiver' : 'Activer',
            icon: row.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />,
            onClick: () => toggleActiveMutation.mutate({ id: row.id, isActive: !row.isActive }),
          }] : []),
        ]} />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Magasins</h1>
            <p className="text-sm text-gray-500 mt-1">{data?.meta?.total ?? 0} entrepots.</p>
          </div>
          <div className="flex gap-2">
            <Can permission="warehouse.manage">
              <AppButton variant="outline" onClick={() => setShowImport(true)}>
                <Upload className="h-4 w-4" />
                Importer
              </AppButton>
            </Can>
            <Can permission="warehouse.manage">
              <AppButton onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau magasin</AppButton>
            </Can>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher un magasin..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="magasins" />
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
            limit={20}
            onPageChange={setPage}
            onRowClick={(row) => router.push(`/warehouses/${row.id}`)}
          />
        </AppCard>
      </div>
      <WarehouseFormDialog open={showCreate} onClose={() => setShowCreate(false)} defaultAgencyId={singleUserAgencyId} />
      <CsvImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        title="Importer des magasins"
        requiredColumns={['name', 'agencyId', 'location']}
        columnLabels={{ name: 'Nom', agencyId: 'ID Agence', location: 'Emplacement' }}
      />
    </PageTransition>
  );
}
