'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Package, MapPin, Plus, Eye, Edit, Trash2, ArrowRightLeft } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppSelect } from '@/components/ui/AppSelect';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { RowActions } from '@/components/shared/RowActions';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParcels } from '@/lib/hooks/useParcels';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate } from '@optipack/shared';
import { toast } from 'sonner';
import { ParcelFormDialog } from '../../parcels/ParcelFormDialog';

export default function WarehouseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const [parcelPage, setParcelPage] = useState(1);
  const [showCreateParcel, setShowCreateParcel] = useState(false);
  const [editParcel, setEditParcel] = useState<any>(null);
  const [deleteParcel, setDeleteParcel] = useState<any>(null);
  const [transferParcel, setTransferParcel] = useState<any>(null);
  const [removeParcel, setRemoveParcel] = useState<any>(null);
  const [targetWarehouseId, setTargetWarehouseId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['warehouses', id],
    queryFn: () => apiClient.get(`/warehouses/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: parcelsData, isLoading: parcelsLoading } = useParcels({ warehouseId: id, limit: 20, page: parcelPage } as any);

  // Load all warehouses for transfer dialog
  const { data: allWarehousesData } = useQuery({
    queryKey: ['all-warehouses-for-transfer'],
    queryFn: () => apiClient.get('/warehouses', { params: { limit: 200 } }).then((r) => r.data),
    enabled: !!transferParcel,
  });

  const warehouse = data?.data;
  if (isLoading) return <DashboardSkeleton />;
  if (!warehouse) return <p className="p-6 text-gray-500">Magasin introuvable</p>;

  const max = Number(warehouse.maxCapacity || 0);
  const current = Number(warehouse.currentOccupancy || 0);
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;

  const warehouseOptions = (allWarehousesData?.data || [])
    .filter((w: any) => w.id !== id)
    .map((w: any) => ({
      value: w.id,
      label: `${w.name} - ${w.agency?.name || ''}`,
    }));

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['warehouses', id] });
    qc.invalidateQueries({ queryKey: ['parcels'] });
  };

  const handleTransferParcel = async () => {
    if (!transferParcel || !targetWarehouseId) return;
    try {
      await apiClient.patch(`/parcels/${transferParcel.id}/status`, {
        status: 'IN_STOCK',
        warehouseId: targetWarehouseId,
      });
      toast.success(`Colis ${transferParcel.trackingNumber} transfere`);
      invalidateAll();
    } catch {
      toast.error('Erreur lors du transfert');
    }
    setTransferParcel(null);
    setTargetWarehouseId('');
  };

  const handleRemoveParcel = async () => {
    if (!removeParcel) return;
    try {
      await apiClient.patch(`/parcels/${removeParcel.id}/status`, {
        status: 'IN_STOCK',
        warehouseId: null,
      });
      toast.success(`Colis ${removeParcel.trackingNumber} retire du magasin`);
      invalidateAll();
    } catch {
      toast.error('Erreur lors du retrait');
    }
    setRemoveParcel(null);
  };

  const handleDeleteParcel = async () => {
    if (!deleteParcel) return;
    try {
      await apiClient.patch(`/parcels/${deleteParcel.id}/status`, { status: 'LOST' });
      toast.success(`Colis ${deleteParcel.trackingNumber} supprime`);
      invalidateAll();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
    setDeleteParcel(null);
  };

  const canModifyParcel = (row: any) => row.status === 'IN_STOCK';

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
    { key: 'client', label: 'Client', render: (row: any) => row.client?.fullName || '-' },
    { key: 'weight', label: 'Masse', render: (row: any) => `${Number(row.weight).toFixed(1)} kg` },
    { key: 'destination', label: 'Destination' },
    { key: 'price', label: 'Prix', render: (row: any) => formatAmount(Number(row.price)) },
    { key: 'status', label: 'Statut', render: (row: any) => <StatusBadge status={row.status} type="parcel" /> },
    { key: 'createdAt', label: 'Date', render: (row: any) => formatDate(row.createdAt) },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions
          actions={[
            { label: 'Voir', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/parcels/${row.id}`) },
            ...(canModifyParcel(row) ? [
              { label: 'Modifier', icon: <Edit className="h-4 w-4" />, onClick: () => router.push(`/parcels/${row.id}`) },
              { label: 'Transferer', icon: <ArrowRightLeft className="h-4 w-4" />, onClick: () => setTransferParcel(row) },
              { label: 'Retirer du magasin', icon: <Package className="h-4 w-4" />, onClick: () => setRemoveParcel(row) },
              { label: 'Supprimer', icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleteParcel(row), variant: 'destructive' as const },
            ] : []),
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
            isLoading={parcelsLoading}
            onRowClick={(row) => router.push(`/parcels/${row.id}`)}
            total={parcelsData?.meta?.total}
            page={parcelPage}
            totalPages={parcelsData?.meta?.totalPages}
            limit={20}
            onPageChange={setParcelPage}
          />
        </AppCard>
      </div>

      <ParcelFormDialog open={showCreateParcel} onClose={() => setShowCreateParcel(false)} />

      {/* Transfer dialog */}
      <AppDialog
        open={!!transferParcel}
        onClose={() => { setTransferParcel(null); setTargetWarehouseId(''); }}
        title="Transferer le colis"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Transferer le colis <span className="font-bold font-mono">{transferParcel?.trackingNumber}</span> ({transferParcel?.designation}) vers un autre magasin.
          </p>
          <AppSelect
            label="Magasin de destination"
            options={warehouseOptions}
            value={targetWarehouseId}
            onValueChange={setTargetWarehouseId}
            placeholder="Selectionner un magasin"
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <AppButton variant="ghost" onClick={() => { setTransferParcel(null); setTargetWarehouseId(''); }}>Annuler</AppButton>
            <AppButton onClick={handleTransferParcel} disabled={!targetWarehouseId}>Transferer</AppButton>
          </div>
        </div>
      </AppDialog>

      {/* Remove from warehouse confirm */}
      <ConfirmDialog
        open={!!removeParcel}
        onClose={() => setRemoveParcel(null)}
        onConfirm={handleRemoveParcel}
        title="Retirer le colis du magasin"
        message={`Le colis ${removeParcel?.trackingNumber} (${removeParcel?.designation}) sera retire de ce magasin. Il ne sera plus associe a aucun magasin.`}
        confirmLabel="Retirer"
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteParcel}
        onClose={() => setDeleteParcel(null)}
        onConfirm={handleDeleteParcel}
        title="Supprimer le colis"
        message={`Le colis ${deleteParcel?.trackingNumber} (${deleteParcel?.designation}) sera marque comme perdu. Cette action est irreversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
      />
    </PageTransition>
  );
}
