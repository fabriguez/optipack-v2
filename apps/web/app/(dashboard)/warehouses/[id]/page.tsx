'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Package, Plus, Eye, Edit, Trash2, ArrowRightLeft, ClipboardCheck, PlayCircle } from 'lucide-react';
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
import { formatAmount, formatDate, formatDurationSince } from '@transitsoftservices/shared';
import { toast } from 'sonner';
import { ParcelFormDialog } from '../../parcels/ParcelFormDialog';
import { AgencyAvatar } from '@/components/shared/AgencyAvatar';

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

  const { data: summaryData } = useQuery({
    queryKey: ['warehouses', id, 'summary'],
    queryFn: () => apiClient.get(`/warehouses/${id}/summary`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: inventoriesData } = useQuery({
    queryKey: ['warehouses', id, 'inventories'],
    queryFn: () => apiClient.get(`/warehouses/${id}/inventories`).then((r) => r.data),
    enabled: !!id,
  });

  // onlyPresent=true : retient uniquement les colis physiquement presents dans
  // ce magasin (cree ici et toujours en stock, ou decharge ici depuis un conteneur).
  const { data: parcelsData, isLoading: parcelsLoading } = useParcels({
    warehouseId: id,
    onlyPresent: true,
    limit: 20,
    page: parcelPage,
  } as any);

  const handleStartInventory = async () => {
    try {
      const res = await apiClient.post(`/warehouses/${id}/inventories`, {});
      toast.success('Inventaire demarre');
      qc.invalidateQueries({ queryKey: ['warehouses', id, 'inventories'] });
      router.push(`/warehouses/${id}/inventory/${res.data.data.id}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Impossible de demarrer l\'inventaire');
    }
  };

  const CATEGORY_LABELS: Record<string, string> = {
    STANDARD: 'Standard',
    DOCUMENT: 'Documents',
    FOOD: 'Alimentaire',
    ELECTRONICS: 'Electronique',
    CLOTHING: 'Vetements',
    OTHER: 'Autres',
  };

  // Load all warehouses for transfer dialog
  const { data: allWarehousesData } = useQuery({
    queryKey: ['all-warehouses-for-transfer'],
    queryFn: () => apiClient.get('/warehouses', { params: { limit: 200 } }).then((r) => r.data),
    enabled: !!transferParcel,
  });

  const warehouse = data?.data;
  if (isLoading) return <DashboardSkeleton />;
  if (!warehouse) return <p className="p-6 text-gray-500">Magasin introuvable</p>;

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
    {
      key: 'warehouseEnteredAt',
      label: 'Temps en stock',
      render: (row: any) => (
        <span className="font-mono text-xs text-gray-600">{formatDurationSince(row.warehouseEnteredAt)}</span>
      ),
    },
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
          {warehouse.agency && (
            <Link href={`/agencies/${warehouse.agency.id}`} title={warehouse.agency.name}>
              <AgencyAvatar agency={warehouse.agency} size={48} rounded="lg" />
            </Link>
          )}
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

        {(() => {
          const summary = summaryData?.data;
          const totals = summary?.totals;
          const byCategory = summary?.byCategory || [];
          const byRoute = summary?.byTransitRoute || [];

          return (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <AppCard>
                  <p className="text-xs text-gray-500">Colis en stock</p>
                  <p className="mt-1 text-lg font-bold">{totals?.parcelCount ?? 0}</p>
                </AppCard>
                <AppCard>
                  <p className="text-xs text-gray-500">Valeur attendue</p>
                  <p className="mt-1 text-lg font-bold text-primary-700">
                    {formatAmount(Number(totals?.expectedValue ?? 0))}
                  </p>
                </AppCard>
                <AppCard>
                  <p className="text-xs text-gray-500">Masse totale</p>
                  <p className="mt-1 text-lg font-bold">{Number(totals?.totalWeight ?? 0).toFixed(2)} kg</p>
                </AppCard>
                <AppCard>
                  <p className="text-xs text-gray-500">Volume total</p>
                  <p className="mt-1 text-lg font-bold">{Number(totals?.totalVolume ?? 0).toFixed(3)} m3</p>
                </AppCard>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <AppCard>
                  <h3 className="text-base font-semibold text-gray-900 mb-3">Par categorie</h3>
                  {byCategory.length === 0 ? (
                    <p className="text-sm text-gray-400">Aucun colis en stock.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500">
                          <th className="pb-2">Categorie</th>
                          <th className="pb-2 text-right">Colis</th>
                          <th className="pb-2 text-right">Valeur attendue</th>
                          <th className="pb-2 text-right">Masse</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {byCategory.map((c: any) => (
                          <tr key={c.category}>
                            <td className="py-2">{CATEGORY_LABELS[c.category] || c.category}</td>
                            <td className="py-2 text-right font-medium">{c.parcelCount}</td>
                            <td className="py-2 text-right text-primary-700 font-medium">{formatAmount(c.expectedValue)}</td>
                            <td className="py-2 text-right text-gray-600">{c.totalWeight.toFixed(2)} kg</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </AppCard>

                <AppCard>
                  <h3 className="text-base font-semibold text-gray-900 mb-3">Par route de transit</h3>
                  {byRoute.length === 0 ? (
                    <p className="text-sm text-gray-400">Aucune route active.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500">
                          <th className="pb-2">Route</th>
                          <th className="pb-2 text-right">Colis</th>
                          <th className="pb-2 text-right">Masse</th>
                          <th className="pb-2 text-right">Volume</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {byRoute.map((r: any) => (
                          <tr key={r.transitRouteId ?? '__none__'}>
                            <td className="py-2">
                              <span className="font-medium">{r.transitRouteName}</span>
                              {r.transitType && (
                                <span className="ml-2 text-[10px] uppercase text-gray-400">{r.transitType}</span>
                              )}
                            </td>
                            <td className="py-2 text-right font-medium">{r.parcelCount}</td>
                            <td className="py-2 text-right text-gray-600">{r.totalWeight.toFixed(2)} kg</td>
                            <td className="py-2 text-right text-gray-600">{r.totalVolume.toFixed(3)} m3</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </AppCard>
              </div>

              <AppCard>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Inventaires</h3>
                    <p className="text-xs text-gray-500">Lancez un inventaire pour reconcilier le stock theorique avec le stock physique.</p>
                  </div>
                  <AppButton size="sm" onClick={handleStartInventory}>
                    <PlayCircle className="h-4 w-4" />
                    Lancer un inventaire
                  </AppButton>
                </div>
                {(() => {
                  const items = inventoriesData?.data || [];
                  if (items.length === 0) {
                    return <p className="text-sm text-gray-400">Aucun inventaire enregistre pour ce magasin.</p>;
                  }
                  return (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500">
                          <th className="pb-2">Date</th>
                          <th className="pb-2">Statut</th>
                          <th className="pb-2 text-right">Items</th>
                          <th className="pb-2">Demarre par</th>
                          <th className="pb-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {items.map((inv: any) => (
                          <tr key={inv.id} className="hover:bg-gray-50">
                            <td className="py-2">{formatDate(inv.startedAt)}</td>
                            <td className="py-2">
                              {inv.status === 'IN_PROGRESS' && <AppBadge variant="warning">En cours</AppBadge>}
                              {inv.status === 'CLOSED' && <AppBadge variant="success">Cloture</AppBadge>}
                              {inv.status === 'CANCELLED' && <AppBadge variant="error">Annule</AppBadge>}
                            </td>
                            <td className="py-2 text-right">{inv._count?.items ?? 0}</td>
                            <td className="py-2 text-gray-600">
                              {inv.startedBy ? `${inv.startedBy.firstName} ${inv.startedBy.lastName}` : '-'}
                            </td>
                            <td className="py-2 text-right">
                              <Link href={`/warehouses/${id}/inventory/${inv.id}`}>
                                <AppButton variant="ghost" size="sm">
                                  <ClipboardCheck className="h-3.5 w-3.5" />
                                  Ouvrir
                                </AppButton>
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </AppCard>
            </>
          );
        })()}

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

      <ParcelFormDialog
        open={showCreateParcel}
        onClose={() => setShowCreateParcel(false)}
        defaultWarehouse={
          warehouse
            ? { id: warehouse.id, name: warehouse.name, agency: warehouse.agency ?? null }
            : null
        }
      />

      {/* Transfer dialog */}
      <AppDialog
        open={!!transferParcel}
        onClose={() => { setTransferParcel(null); setTargetWarehouseId(''); }}
        title="Transferer le colis"
        size="md"
        footer={
          <>
            <AppButton variant="ghost" onClick={() => { setTransferParcel(null); setTargetWarehouseId(''); }}>Annuler</AppButton>
            <AppButton onClick={handleTransferParcel} disabled={!targetWarehouseId}>Transferer</AppButton>
          </>
        }
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
