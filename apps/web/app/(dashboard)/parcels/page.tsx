'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Upload, Package, Eye, RefreshCw } from 'lucide-react';
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
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { useParcels } from '@/lib/hooks/useParcels';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate } from '@optipack/shared';
import { toast } from 'sonner';
import { ParcelFormDialog } from './ParcelFormDialog';

function ParcelsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { page, search, setPage, setSearch, queryParams } = useServerPagination();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const statusFilter = searchParams.get('status') || '';
  const clientIdFilter = searchParams.get('clientId') || '';
  const warehouseIdFilter = searchParams.get('warehouseId') || '';

  const { data, isLoading } = useParcels({
    ...queryParams,
    status: statusFilter || undefined,
    clientId: clientIdFilter || undefined,
    warehouseId: warehouseIdFilter || undefined,
  } as any);

  const handleImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    for (const row of rows) {
      try {
        await apiClient.post('/parcels', {
          designation: row.designation,
          weight: Number(row.weight),
          destination: row.destination,
          clientId: row.clientId,
          warehouseId: row.warehouseId,
          transitRouteId: row.transitRouteId,
        });
        success++;
      } catch { /* skip */ }
    }
    toast.success(`${success}/${rows.length} colis importes`);
  };

  const exportColumns = [
    { key: 'trackingNumber', label: 'Tracking' },
    { key: 'designation', label: 'Designation' },
    { key: 'client', label: 'Client' },
    { key: 'weight', label: 'Masse' },
    { key: 'destination', label: 'Destination' },
    { key: 'price', label: 'Prix' },
    { key: 'status', label: 'Statut' },
    { key: 'createdAt', label: 'Date' },
  ];

  const filterFields = [
    {
      key: 'status',
      label: 'Statut',
      type: 'select' as const,
      options: [
        { value: 'IN_STOCK', label: 'En stock' },
        { value: 'LOADING', label: 'Chargement' },
        { value: 'IN_TRANSIT', label: 'En transit' },
        { value: 'ARRIVED', label: 'Arrives' },
        { value: 'RECEIVED', label: 'Receptionnes' },
        { value: 'DELIVERED', label: 'Livres' },
      ],
    },
    { key: 'clientId', label: 'ID Client', type: 'text' as const },
    { key: 'warehouseId', label: 'ID Magasin', type: 'text' as const },
  ];

  const columns = [
    {
      key: 'trackingNumber',
      label: 'Tracking',
      render: (row: any) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50">
            <Package className="h-4 w-4 text-primary-600" />
          </div>
          <Link href={`/parcels/${row.id}`} className="font-mono text-xs font-bold text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>{row.trackingNumber}</Link>
        </div>
      ),
    },
    {
      key: 'designation',
      label: 'Designation',
      render: (row: any) => (
        <div>
          <p className="font-medium text-gray-900">{row.designation}</p>
          <p className="text-xs text-gray-400">{row.destination}</p>
        </div>
      ),
    },
    {
      key: 'client',
      label: 'Client',
      render: (row: any) => (
        <div>
          <p className="text-sm text-gray-900">{row.client?.fullName || '-'}</p>
          <p className="text-xs text-gray-400">{row.client?.phone || ''}</p>
        </div>
      ),
    },
    {
      key: 'weight',
      label: 'Masse',
      render: (row: any) => <span className="text-sm font-medium">{Number(row.weight).toFixed(1)} kg</span>,
    },
    {
      key: 'price',
      label: 'Prix',
      render: (row: any) => <span className="text-sm font-bold text-gray-900">{formatAmount(Number(row.price))}</span>,
    },
    {
      key: 'status',
      label: 'Statut',
      render: (row: any) => <StatusBadge status={row.status} type="parcel" />,
    },
    {
      key: 'invoice',
      label: 'Facture',
      render: (row: any) => row.invoice ? <StatusBadge status={row.invoice.status} type="invoice" /> : <span className="text-xs text-gray-300">-</span>,
    },
    {
      key: 'createdAt',
      label: 'Date',
      render: (row: any) => <span className="text-xs text-gray-500">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions actions={[
          { label: 'Voir details', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/parcels/${row.id}`) },
          { label: 'Changer statut', icon: <RefreshCw className="h-4 w-4" />, onClick: () => router.push(`/parcels/${row.id}`) },
        ]} />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Colis</h1>
            <p className="text-sm text-gray-500 mt-1">{data?.meta?.total ?? 0} colis au total</p>
          </div>
          <div className="flex gap-2">
            <AppButton variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4" />
              Importer
            </AppButton>
            <AppButton onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Nouveau colis
            </AppButton>
          </div>
        </div>

        {/* Search --- Export | Filtres | Effacer */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Tracking, designation, client..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="colis" />
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
            onRowClick={(row) => router.push(`/parcels/${row.id}`)}
          />
        </AppCard>

        <ParcelFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
        <CsvImportDialog
          open={showImport}
          onClose={() => setShowImport(false)}
          onImport={handleImport}
          title="Importer des colis"
          requiredColumns={['designation', 'weight', 'destination', 'clientId', 'warehouseId', 'transitRouteId']}
          columnLabels={{ designation: 'Designation', weight: 'Masse (kg)', destination: 'Destination', clientId: 'ID Client', warehouseId: 'ID Magasin', transitRouteId: 'ID Route' }}
        />
      </div>
    </PageTransition>
  );
}

export default function ParcelsPage() {
  return <Suspense><ParcelsContent /></Suspense>;
}
