'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Package, Play, PackageCheck, Plus, Eye, PackageMinus, Search } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppCheckbox } from '@/components/ui/AppCheckbox';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { RowActions } from '@/components/shared/RowActions';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useContainer, useContainerParcels, useDepartContainer, useArriveContainer, useLoadParcels } from '@/lib/hooks/useContainers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate, formatDateTime } from '@optipack/shared';
import { toast } from 'sonner';

export default function ContainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading } = useContainer(id);
  const { data: parcelsData } = useContainerParcels(id);
  const departMutation = useDepartContainer();
  const arriveMutation = useArriveContainer();
  const loadMutation = useLoadParcels();
  const [showDepart, setShowDepart] = useState(false);
  const [showArrive, setShowArrive] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showUnloadConfirm, setShowUnloadConfirm] = useState<string | null>(null);
  const [selectedParcelIds, setSelectedParcelIds] = useState<string[]>([]);
  const [parcelSearch, setParcelSearch] = useState('');

  const { data: historyData } = useQuery({
    queryKey: ['containers', id, 'history'],
    queryFn: () => apiClient.get(`/containers/${id}/history`).then((r) => r.data).catch(() => ({ data: [] })),
    enabled: !!id,
  });

  // Fetch available parcels (IN_STOCK) for loading
  const { data: availableParcels, isLoading: loadingAvailable } = useQuery({
    queryKey: ['parcels-available', parcelSearch],
    queryFn: () => apiClient.get('/parcels', {
      params: { status: 'IN_STOCK', limit: 50, search: parcelSearch || undefined },
    }).then((r) => r.data),
    enabled: showLoadDialog,
  });

  const container = data?.data;
  const parcels = parcelsData?.data || [];
  const history = historyData?.data || [];

  if (isLoading) return <DashboardSkeleton />;
  if (!container) return <p className="p-6 text-gray-500">Conteneur introuvable</p>;

  const loadPercent = Number(container.capacity) > 0
    ? Math.round((Number(container.currentLoad) / Number(container.capacity)) * 100)
    : 0;

  const canLoad = container.status === 'EMPTY' || container.status === 'LOADING';

  const handleLoadParcels = async () => {
    if (selectedParcelIds.length === 0) return;
    await loadMutation.mutateAsync({ id, parcelIds: selectedParcelIds });
    setSelectedParcelIds([]);
    setShowLoadDialog(false);
    qc.invalidateQueries({ queryKey: ['containers', id] });
    qc.invalidateQueries({ queryKey: ['containers', id, 'parcels'] });
  };

  const handleUnloadParcel = async (parcelId: string) => {
    try {
      await apiClient.post(`/containers/${id}/unload`, { parcelId });
      toast.success('Colis decharge');
      qc.invalidateQueries({ queryKey: ['containers', id] });
      qc.invalidateQueries({ queryKey: ['containers', id, 'parcels'] });
      qc.invalidateQueries({ queryKey: ['parcels'] });
    } catch {
      toast.error('Erreur lors du dechargement');
    }
    setShowUnloadConfirm(null);
  };

  const toggleParcelSelection = (parcelId: string) => {
    setSelectedParcelIds((prev) =>
      prev.includes(parcelId) ? prev.filter((p) => p !== parcelId) : [...prev, parcelId],
    );
  };

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
    { key: 'destination', label: 'Destination' },
    { key: 'client', label: 'Client', render: (row: any) => row.client?.fullName || '-' },
    { key: 'status', label: 'Statut', render: (row: any) => <StatusBadge status={row.status} type="parcel" /> },
    {
      key: 'actions',
      label: '',
      render: (row: any) => (
        <RowActions
          actions={[
            { label: 'Voir', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/parcels/${row.id}`) },
            ...(container.status === 'ARRIVED' || container.status === 'UNLOADING'
              ? [{ label: 'Decharger', icon: <PackageMinus className="h-4 w-4" />, onClick: () => setShowUnloadConfirm(row.id) }]
              : []),
          ]}
        />
      ),
    },
  ];

  const historyColumns = [
    { key: 'action', label: 'Action', render: (row: any) => <span className="text-sm font-medium">{row.action}</span> },
    {
      key: 'statusBefore',
      label: 'Avant',
      render: (row: any) => row.statusBefore ? <StatusBadge status={row.statusBefore} type="container" /> : <span className="text-gray-400">-</span>,
    },
    {
      key: 'statusAfter',
      label: 'Apres',
      render: (row: any) => row.statusAfter ? <StatusBadge status={row.statusAfter} type="container" /> : <span className="text-gray-400">-</span>,
    },
    { key: 'actorName', label: 'Par', render: (row: any) => row.actorName || row.user?.firstName || '-' },
    { key: 'createdAt', label: 'Date', render: (row: any) => formatDateTime(row.createdAt) },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{container.designation}</h1>
                <StatusBadge status={container.status} type="container" />
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {container.departureAgency ? (
                  <Link href={`/agencies/${container.departureAgency.id}`} className="text-primary-600 hover:underline">
                    {container.departureAgency.name}
                  </Link>
                ) : '-'}
                {' '}&rarr;{' '}
                {container.arrivalAgency ? (
                  <Link href={`/agencies/${container.arrivalAgency.id}`} className="text-primary-600 hover:underline">
                    {container.arrivalAgency.name}
                  </Link>
                ) : '-'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {container.status === 'LOADING' && (
              <AppButton onClick={() => setShowDepart(true)}>
                <Play className="h-4 w-4" />
                Depart
              </AppButton>
            )}
            {container.status === 'IN_TRANSIT' && (
              <AppButton onClick={() => setShowArrive(true)}>
                <PackageCheck className="h-4 w-4" />
                Arrivee
              </AppButton>
            )}
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <AppCard>
            <p className="text-sm text-gray-500">Type</p>
            <p className="mt-1 text-lg font-bold">{container.type === 'AIR' ? 'Aerien' : container.type === 'SEA' ? 'Maritime' : 'Terrestre'}</p>
          </AppCard>
          <AppCard>
            <p className="text-sm text-gray-500">Colis charges</p>
            <p className="mt-1 text-lg font-bold">{parcels.length}</p>
          </AppCard>
          <AppCard>
            <p className="text-sm text-gray-500">Chargement</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-3 flex-1 rounded-full bg-gray-200">
                <div className={`h-3 rounded-full transition-all ${loadPercent > 80 ? 'bg-red-500' : 'bg-primary-500'}`} style={{ width: `${Math.min(loadPercent, 100)}%` }} />
              </div>
              <span className="text-sm font-bold">{loadPercent}%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">{Number(container.currentLoad).toFixed(0)} / {Number(container.capacity).toFixed(0)} kg</p>
          </AppCard>
          <AppCard>
            <p className="text-sm text-gray-500">Date creation</p>
            <p className="mt-1 text-lg font-bold">{formatDate(container.createdAt)}</p>
          </AppCard>
        </div>

        {/* Parcels list */}
        <AppCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Colis dans le conteneur ({parcels.length})</h3>
            {canLoad && (
              <AppButton size="sm" onClick={() => setShowLoadDialog(true)}>
                <Plus className="h-3.5 w-3.5" />
                Charger colis
              </AppButton>
            )}
          </div>
          <AppDataTable columns={parcelColumns} data={parcels} onRowClick={(row) => router.push(`/parcels/${row.id}`)} />
        </AppCard>

        {/* Container history */}
        {history.length > 0 && (
          <AppCard>
            <AppCardHeader title={`Historique du conteneur (${history.length})`} />
            <AppDataTable columns={historyColumns} data={history} />
          </AppCard>
        )}

        {/* Load parcels dialog */}
        <AppDialog open={showLoadDialog} onClose={() => { setShowLoadDialog(false); setSelectedParcelIds([]); }} title="Charger des colis" size="lg">
          <div className="space-y-4">
            <AppInput
              placeholder="Rechercher par tracking, designation, client..."
              value={parcelSearch}
              onChange={(e) => setParcelSearch(e.target.value)}
            />
            <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-xl">
              {loadingAvailable ? (
                <p className="p-4 text-sm text-gray-400">Chargement...</p>
              ) : (availableParcels?.data || []).length === 0 ? (
                <p className="p-4 text-sm text-gray-400">Aucun colis en stock disponible</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="w-10 p-3"></th>
                      <th className="text-left p-3 font-medium text-gray-600">Tracking</th>
                      <th className="text-left p-3 font-medium text-gray-600">Designation</th>
                      <th className="text-left p-3 font-medium text-gray-600">Masse</th>
                      <th className="text-left p-3 font-medium text-gray-600">Client</th>
                      <th className="text-left p-3 font-medium text-gray-600">Destination</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(availableParcels?.data || []).map((p: any) => (
                      <tr
                        key={p.id}
                        className={`cursor-pointer hover:bg-primary-50/50 transition-colors ${selectedParcelIds.includes(p.id) ? 'bg-primary-50' : ''}`}
                        onClick={() => toggleParcelSelection(p.id)}
                      >
                        <td className="p-3">
                          <AppCheckbox checked={selectedParcelIds.includes(p.id)} onCheckedChange={() => toggleParcelSelection(p.id)} />
                        </td>
                        <td className="p-3 font-mono text-xs font-bold text-primary-700">{p.trackingNumber}</td>
                        <td className="p-3">{p.designation}</td>
                        <td className="p-3">{Number(p.weight).toFixed(1)} kg</td>
                        <td className="p-3">{p.client?.fullName || '-'}</td>
                        <td className="p-3">{p.destination}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {selectedParcelIds.length > 0 && (
              <p className="text-sm text-primary-700 font-medium">{selectedParcelIds.length} colis selectionne(s)</p>
            )}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <AppButton variant="ghost" onClick={() => { setShowLoadDialog(false); setSelectedParcelIds([]); }}>Annuler</AppButton>
              <AppButton onClick={handleLoadParcels} loading={loadMutation.isPending} disabled={selectedParcelIds.length === 0}>
                <Package className="h-4 w-4" />
                Charger {selectedParcelIds.length} colis
              </AppButton>
            </div>
          </div>
        </AppDialog>

        {/* Unload confirm */}
        <ConfirmDialog
          open={!!showUnloadConfirm}
          onClose={() => setShowUnloadConfirm(null)}
          onConfirm={() => showUnloadConfirm && handleUnloadParcel(showUnloadConfirm)}
          title="Decharger le colis"
          message="Ce colis sera retire du conteneur et remis en stock dans le magasin de destination."
          confirmLabel="Decharger"
        />

        <ConfirmDialog
          open={showDepart}
          onClose={() => setShowDepart(false)}
          onConfirm={() => { departMutation.mutate(id); setShowDepart(false); }}
          title="Confirmer le depart"
          message={`Le conteneur ${container.designation} et ses ${parcels.length} colis passeront en transit. Cette action est irreversible.`}
          confirmLabel="Confirmer le depart"
          loading={departMutation.isPending}
        />
        <ConfirmDialog
          open={showArrive}
          onClose={() => setShowArrive(false)}
          onConfirm={() => { arriveMutation.mutate(id); setShowArrive(false); }}
          title="Confirmer l'arrivee"
          message={`Le conteneur ${container.designation} et ses ${parcels.length} colis seront marques comme arrives.`}
          confirmLabel="Confirmer l'arrivee"
          loading={arriveMutation.isPending}
        />
      </div>
    </PageTransition>
  );
}
