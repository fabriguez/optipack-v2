'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Warehouse, Package, MapPin, Plus, Eye, RefreshCw } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { RowActions } from '@/components/shared/RowActions';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useQuery } from '@tanstack/react-query';
import { useParcels } from '@/lib/hooks/useParcels';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate } from '@optipack/shared';
import { ParcelFormDialog } from '../../parcels/ParcelFormDialog';

export default function WarehouseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [parcelPage, setParcelPage] = useState(1);
  const [showCreateParcel, setShowCreateParcel] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['warehouses', id],
    queryFn: () => apiClient.get(`/warehouses/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: parcelsData } = useParcels({ warehouseId: id, limit: 20, page: parcelPage } as any);

  const warehouse = data?.data;
  if (isLoading) return <DashboardSkeleton />;
  if (!warehouse) return <p className="p-6 text-gray-500">Magasin introuvable</p>;

  const max = Number(warehouse.maxCapacity || 0);
  const current = Number(warehouse.currentOccupancy || 0);
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;

  const parcelColumns = [
    {
      key: 'trackingNumber',
      label: 'Tracking',
      render: (row: any) => (
        <Link href={`/parcels/${row.id}`} className="font-mono text-xs text-primary-700 font-bold hover:underline" onClick={(e) => e.stopPropagation()}>
          {row.trackingNumber}
        </Link>
      ),
    },
    { key: 'designation', label: 'Designation' },
    { key: 'weight', label: 'Masse', render: (row: any) => `${Number(row.weight).toFixed(1)} kg` },
    { key: 'status', label: 'Statut', render: (row: any) => <StatusBadge status={row.status} type="parcel" /> },
    { key: 'createdAt', label: 'Date', render: (row: any) => formatDate(row.createdAt) },
    {
      key: 'actions',
      label: '',
      render: (row: any) => (
        <RowActions
          actions={[
            { label: 'Voir', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/parcels/${row.id}`) },
            { label: 'Changer statut', icon: <RefreshCw className="h-4 w-4" />, onClick: () => router.push(`/parcels/${row.id}`) },
          ]}
        />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{warehouse.name}</h1>
              <AppBadge variant={warehouse.isActive ? 'success' : 'error'}>{warehouse.isActive ? 'Actif' : 'Inactif'}</AppBadge>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {warehouse.location}
              {warehouse.agency && (
                <>
                  {' '}&mdash;{' '}
                  <Link href={`/agencies/${warehouse.agency.id}`} className="text-primary-600 hover:underline">
                    {warehouse.agency.name}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50"><MapPin className="h-5 w-5 text-primary-600" /></div>
              <div>
                <p className="text-xs text-gray-400">Type</p>
                <p className="text-sm font-medium">{warehouse.type === 'STORAGE' ? 'Stockage' : warehouse.type === 'TRANSIT' ? 'Transit' : 'Livraison'}</p>
              </div>
            </div>
          </AppCard>
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50"><Package className="h-5 w-5 text-primary-600" /></div>
              <div>
                <p className="text-xs text-gray-400">Colis en stock</p>
                <p className="text-sm font-bold">{parcelsData?.meta?.total ?? 0}</p>
              </div>
            </div>
          </AppCard>
          <AppCard>
            <p className="text-xs text-gray-400 mb-2">Occupation</p>
            <div className="flex items-center gap-3">
              <div className="h-3 flex-1 rounded-full bg-gray-200">
                <div className={`h-3 rounded-full transition-all ${pct > 80 ? 'bg-red-500' : 'bg-primary-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <span className="text-sm font-bold">{pct}%</span>
            </div>
            {max > 0 && <p className="text-xs text-gray-400 mt-1">{current.toFixed(0)} / {max.toFixed(0)} kg</p>}
          </AppCard>
        </div>

        <AppCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Colis dans ce magasin ({parcelsData?.meta?.total ?? 0})</h3>
            <div className="flex items-center gap-2">
              <Link href={`/parcels?warehouseId=${id}`}>
                <AppButton variant="ghost" size="sm">Voir tout</AppButton>
              </Link>
              <AppButton size="sm" onClick={() => setShowCreateParcel(true)}>
                <Plus className="h-3.5 w-3.5" />
                Ajouter colis
              </AppButton>
            </div>
          </div>
          <AppDataTable
            columns={parcelColumns}
            data={parcelsData?.data || []}
            onRowClick={(row) => router.push(`/parcels/${row.id}`)}
            total={parcelsData?.meta?.total}
            page={parcelPage}
            totalPages={parcelsData?.meta?.totalPages}
            onPageChange={setParcelPage}
          />
        </AppCard>
      </div>

      <ParcelFormDialog open={showCreateParcel} onClose={() => setShowCreateParcel(false)} />
    </PageTransition>
  );
}
