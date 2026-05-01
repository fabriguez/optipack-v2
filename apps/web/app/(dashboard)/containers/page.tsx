'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Upload, Container, Eye, Package } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { CsvImportDialog } from '@/components/shared/CsvImportDialog';
import { RowActions } from '@/components/shared/RowActions';
import { useContainers } from '@/lib/hooks/useContainers';
import { apiClient } from '@/lib/api/client';
import { formatDate } from '@transitsoftservices/shared';
import { toast } from 'sonner';
import { ContainerFormDialog } from './ContainerFormDialog';

export default function ContainersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = searchParams.get('status') || '';
  const typeFilter = searchParams.get('type') || '';

  const { data, isLoading } = useContainers({
    page,
    limit: 20,
    status: statusFilter || undefined,
    type: typeFilter || undefined,
  } as any);

  const handleImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    for (const row of rows) {
      try {
        await apiClient.post('/containers', {
          designation: row.designation,
          type: row.type,
          capacity: Number(row.capacity),
          departureAgencyId: row.departureAgencyId,
          arrivalAgencyId: row.arrivalAgencyId,
        });
        success++;
      } catch { /* skip */ }
    }
    toast.success(`${success}/${rows.length} conteneurs importes`);
  };

  const exportColumns = [
    { key: 'designation', label: 'Designation' },
    { key: 'type', label: 'Type' },
    { key: 'departureAgency', label: 'Agence depart' },
    { key: 'arrivalAgency', label: 'Agence arrivee' },
    { key: 'capacity', label: 'Capacite' },
    { key: 'status', label: 'Statut' },
  ];

  const filterFields = [
    {
      key: 'status',
      label: 'Statut',
      type: 'select' as const,
      options: [
        { value: 'EMPTY', label: 'Vide' },
        { value: 'LOADING', label: 'En chargement' },
        { value: 'IN_TRANSIT', label: 'En transit' },
        { value: 'ARRIVED', label: 'Receptionne' },
        { value: 'UNLOADING', label: 'En dechargement' },
        { value: 'UNLOADED', label: 'Decharge' },
      ],
    },
    {
      key: 'type',
      label: 'Type',
      type: 'select' as const,
      options: [
        { value: 'AIR', label: 'Aerien' },
        { value: 'SEA', label: 'Maritime' },
        { value: 'LAND', label: 'Terrestre' },
      ],
    },
    {
      key: 'isForwarding',
      label: 'Acheminement',
      type: 'select' as const,
      options: [
        { value: 'true', label: 'Acheminement uniquement' },
        { value: 'false', label: 'Standard uniquement' },
      ],
    },
  ];

  const columns = [
    {
      key: 'designation',
      label: 'Designation',
      render: (row: any) => (
        <Link href={`/containers/${row.id}`} className="font-mono text-xs font-semibold text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>{row.designation}</Link>
      ),
    },
    { key: 'type', label: 'Type', render: (row: any) => (
      <div className="flex items-center gap-1">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
          row.type === 'AIR' ? 'bg-blue-50 text-blue-700' :
          row.type === 'SEA' ? 'bg-cyan-50 text-cyan-700' :
          'bg-amber-50 text-amber-700'
        }`}>{row.type === 'AIR' ? 'Aerien' : row.type === 'SEA' ? 'Maritime' : 'Terrestre'}</span>
        {row.isForwarding && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary-50 text-primary-700">Acheminement</span>
        )}
      </div>
    )},
    { key: 'departureAgency', label: 'Depart', render: (row: any) => row.departureAgency?.name || '-' },
    { key: 'arrivalAgency', label: 'Arrivee', render: (row: any) => row.arrivalAgency?.name || '-' },
    { key: 'capacity', label: 'Capacite', render: (row: any) => {
      const unit = row.type === 'SEA' ? 'm3' : 'kg';
      return (
        <div className="text-xs">
          <span className="font-medium">{Number(row.currentLoad).toFixed(unit === 'm3' ? 2 : 0)}</span>
          <span className="text-gray-400"> / {Number(row.capacity).toFixed(unit === 'm3' ? 2 : 0)} {unit}</span>
        </div>
      );
    }},
    { key: '_count', label: 'Colis', render: (row: any) => row._count?.parcels ?? 0 },
    {
      key: 'status',
      label: 'Statut',
      render: (row: any) => <StatusBadge status={row.status} type="container" />,
    },
    { key: 'createdAt', label: 'Date', render: (row: any) => formatDate(row.createdAt) },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions actions={[
          { label: 'Voir details', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/containers/${row.id}`) },
          { label: 'Voir les colis', icon: <Package className="h-4 w-4" />, onClick: () => router.push(`/containers/${row.id}`) },
        ]} />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Conteneurs</h1>
            <p className="text-sm text-gray-500 mt-1">Gerez les conteneurs et leur chargement.</p>
          </div>
          <div className="flex gap-2">
            <AppButton variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4" />
              Importer
            </AppButton>
            <AppButton onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Nouveau conteneur
            </AppButton>
          </div>
        </div>

        {/* Search --- Export | Filtres | Effacer */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher un conteneur..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="conteneurs" />
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
            onPageChange={setPage}
            onRowClick={(row) => router.push(`/containers/${row.id}`)}
          />
        </AppCard>

        <ContainerFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
        <CsvImportDialog
          open={showImport}
          onClose={() => setShowImport(false)}
          onImport={handleImport}
          title="Importer des conteneurs"
          requiredColumns={['designation', 'type', 'capacity', 'departureAgencyId', 'arrivalAgencyId']}
          columnLabels={{ designation: 'Designation', type: 'Type', capacity: 'Capacite (kg)', departureAgencyId: 'ID Agence depart', arrivalAgencyId: 'ID Agence arrivee' }}
        />
      </div>
    </PageTransition>
  );
}
