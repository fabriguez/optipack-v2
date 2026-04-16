'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Upload, Eye } from 'lucide-react';
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
import { useAgencies } from '@/lib/hooks/useAgencies';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import { WarehouseFormDialog } from './WarehouseFormDialog';

const TYPE_LABELS: Record<string, string> = { STORAGE: 'Stockage', TRANSIT: 'Transit', DELIVERY: 'Livraison' };

export default function WarehousesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data: agencies } = useAgencies({ limit: 100 });

  const agencyIdFilter = searchParams.get('agencyId') || '';

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

  const handleImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    for (const row of rows) {
      try {
        await apiClient.post('/warehouses', {
          name: row.name,
          agencyId: row.agencyId,
          location: row.location,
          type: row.type,
        });
        success++;
      } catch { /* skip */ }
    }
    toast.success(`${success}/${rows.length} magasins importes`);
  };

  const exportColumns = [
    { key: 'name', label: 'Nom' },
    { key: 'location', label: 'Emplacement' },
    { key: 'type', label: 'Type' },
    { key: 'agency', label: 'Agence' },
  ];

  const filterFields = [
    {
      key: 'agencyId',
      label: 'Agence',
      type: 'select' as const,
      options: (agencies?.data || []).map((a: any) => ({ value: a.id, label: a.name })),
    },
  ];

  const columns = [
    { key: 'name', label: 'Nom', render: (row: any) => <Link href={`/warehouses/${row.id}`} className="text-primary-700 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{row.name}</Link> },
    { key: 'location', label: 'Emplacement' },
    { key: 'agency', label: 'Agence', render: (row: any) => <span className="text-sm">{row.agency?.name || '-'}</span> },
    { key: 'type', label: 'Type', render: (row: any) => <AppBadge>{TYPE_LABELS[row.type] || row.type}</AppBadge> },
    {
      key: 'capacity', label: 'Occupation', render: (row: any) => {
        const max = Number(row.maxCapacity || 0);
        const current = Number(row.currentOccupancy || 0);
        if (!max) return `${current} kg`;
        const pct = Math.round((current / max) * 100);
        return (
          <div className="flex items-center gap-2">
            <div className="h-2 w-20 rounded-full bg-gray-200">
              <div className={`h-2 rounded-full ${pct > 80 ? 'bg-red-500' : 'bg-primary-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className="text-xs text-gray-500">{pct}%</span>
          </div>
        );
      },
    },
    { key: '_count', label: 'Colis', render: (row: any) => row._count?.parcels ?? 0 },
    { key: 'isActive', label: 'Statut', render: (row: any) => <AppBadge variant={row.isActive ? 'success' : 'error'}>{row.isActive ? 'Actif' : 'Inactif'}</AppBadge> },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions actions={[
          { label: 'Voir details', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/warehouses/${row.id}`) },
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
            <p className="text-sm text-gray-500 mt-1">{data?.meta?.total ?? 0} entrepots et suivi de remplissage.</p>
          </div>
          <div className="flex gap-2">
            <AppButton variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4" />
              Importer
            </AppButton>
            <AppButton onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau magasin</AppButton>
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
      <WarehouseFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <CsvImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        title="Importer des magasins"
        requiredColumns={['name', 'agencyId', 'location', 'type']}
        columnLabels={{ name: 'Nom', agencyId: 'ID Agence', location: 'Emplacement', type: 'Type' }}
      />
    </PageTransition>
  );
}
