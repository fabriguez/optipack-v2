'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Package, Play, PackageCheck, Plus, Eye, PackageMinus,
  FileText, FileCheck, FileDiff, Printer, History, AlertCircle, Truck,
} from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppCheckbox } from '@/components/ui/AppCheckbox';
import { AppTabs } from '@/components/ui/AppTabs';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { RowActions } from '@/components/shared/RowActions';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import {
  useContainer, useContainerParcels, useDepartContainer,
  useArriveContainer, useLoadParcels,
} from '@/lib/hooks/useContainers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { containersApi, manifestsApi } from '@/lib/api/containers';
import { searchers } from '@/lib/api/searchers';
import { formatDate, formatDateTime } from '@transitsoftservices/shared';
import { toast } from 'sonner';
import { ComparisonDialog } from './ComparisonDialog';
import { ParcelFormDialog } from '@/app/(dashboard)/parcels/ParcelFormDialog';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const STATUS_LABELS: Record<string, string> = {
  EMPTY: 'Vide',
  LOADING: 'En chargement',
  IN_TRANSIT: 'En transit',
  ARRIVED: 'Receptionne',
  RECEIVED: 'Receptionne',
  UNLOADING: 'En dechargement',
  UNLOADED: 'Decharge',
};

const TYPE_LABELS: Record<string, string> = {
  AIR: 'Aerien',
  SEA: 'Maritime',
  LAND: 'Terrestre',
};

const ACTION_LABELS: Record<string, string> = {
  CREATED: 'Conteneur cree',
  PARCELS_LOADED: 'Colis charges',
  DEPARTED: 'Depart',
  ARRIVED: 'Arrivee',
  UNLOADING_STARTED: 'Debut de dechargement',
  DISPATCH_MANIFEST_CREATED: "Bordereau d'envoi genere",
  RECEPTION_MANIFEST_CREATED: 'Bordereau de reception genere',
  DISCREPANCY_MISSING: 'Ecart : colis manquant',
  DISCREPANCY_EXTRA: 'Ecart : colis trouve en plus',
};

export default function ContainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useContainer(id);
  const { data: parcelsData } = useContainerParcels(id);
  const { data: historyData } = useQuery({
    queryKey: ['containers', id, 'history'],
    queryFn: () => containersApi.history(id),
    enabled: !!id,
  });

  const departMutation = useDepartContainer();
  const arriveMutation = useArriveContainer();
  const loadMutation = useLoadParcels();

  const [showDepart, setShowDepart] = useState(false);
  const [showArrive, setShowArrive] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [unloadTarget, setUnloadTarget] = useState<{ id: string; designation: string } | null>(null);
  const [unloadAction, setUnloadAction] = useState<'received' | 'not_found' | 'modified'>('received');
  const [unloadWarehouseId, setUnloadWarehouseId] = useState<string | null>(null);
  const [unloadWeight, setUnloadWeight] = useState('');
  const [unloadComment, setUnloadComment] = useState('');
  const [unloading, setUnloading] = useState(false);
  const [selectedParcelIds, setSelectedParcelIds] = useState<string[]>([]);
  const [parcelSearch, setParcelSearch] = useState('');
  const [parcelPage, setParcelPage] = useState(1);
  const [showComparison, setShowComparison] = useState(false);
  const [showCreateParcel, setShowCreateParcel] = useState(false);
  const [busyManifest, setBusyManifest] = useState<'dispatch' | 'reception' | null>(null);

  const PARCEL_PAGE_SIZE = 20;
  const containerType = data?.data?.type as 'AIR' | 'SEA' | 'LAND' | undefined;
  const isForwarding = !!data?.data?.isForwarding;

  const { data: availableParcels, isLoading: loadingAvailable } = useQuery({
    queryKey: ['parcels-available', parcelSearch, parcelPage, containerType, isForwarding],
    queryFn: () => apiClient.get('/parcels', {
      params: {
        status: 'IN_STOCK',
        page: parcelPage,
        limit: PARCEL_PAGE_SIZE,
        search: parcelSearch || undefined,
        transitType: !isForwarding && containerType ? containerType : undefined,
      },
    }).then((r) => r.data),
    enabled: showLoadDialog && !!containerType,
  });

  const container = data?.data;
  const parcels = parcelsData?.data || [];
  const history = historyData?.data || [];

  if (isLoading) return <DashboardSkeleton />;
  if (!container) return <p className="p-6 text-gray-500">Conteneur introuvable</p>;

  const loadPercent = Number(container.capacity) > 0
    ? Math.round((Number(container.currentLoad) / Number(container.capacity)) * 100)
    : 0;
  const capacityUnit = container.type === 'SEA' ? 'm3' : 'kg';
  const containerTypeLabel = TYPE_LABELS[container.type] || container.type;

  const canLoad = container.status === 'EMPTY' || container.status === 'LOADING';
  const canUnload = container.status === 'ARRIVED' || container.status === 'UNLOADING' || container.status === 'RECEIVED';
  const isClosed = container.status === 'UNLOADED';

  const handleLoadParcels = async () => {
    if (selectedParcelIds.length === 0) return;
    await loadMutation.mutateAsync({ id, parcelIds: selectedParcelIds });
    setSelectedParcelIds([]);
    setShowLoadDialog(false);
    qc.invalidateQueries({ queryKey: ['containers', id] });
    qc.invalidateQueries({ queryKey: ['containers', id, 'parcels'] });
    qc.invalidateQueries({ queryKey: ['containers', id, 'history'] });
  };

  const handleUnloadConfirm = async () => {
    if (!unloadTarget) return;
    if (!unloadWarehouseId && unloadAction !== 'not_found') {
      toast.error('Selectionnez un magasin de destination');
      return;
    }
    setUnloading(true);
    try {
      await containersApi.unload(id, {
        parcelId: unloadTarget.id,
        action: unloadAction,
        warehouseId: unloadWarehouseId || '',
        newWeight: unloadAction === 'modified' && unloadWeight ? Number(unloadWeight) : undefined,
        comment: unloadComment || undefined,
      });
      toast.success('Colis decharge');
      qc.invalidateQueries({ queryKey: ['containers', id] });
      qc.invalidateQueries({ queryKey: ['containers', id, 'parcels'] });
      qc.invalidateQueries({ queryKey: ['containers', id, 'history'] });
      qc.invalidateQueries({ queryKey: ['parcels'] });
      setUnloadTarget(null);
      setUnloadAction('received');
      setUnloadWarehouseId(null);
      setUnloadWeight('');
      setUnloadComment('');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur lors du dechargement');
    }
    setUnloading(false);
  };

  const toggleParcelSelection = (parcelId: string) => {
    setSelectedParcelIds((prev) =>
      prev.includes(parcelId) ? prev.filter((p) => p !== parcelId) : [...prev, parcelId],
    );
  };

  const handleGenerateDispatch = async () => {
    setBusyManifest('dispatch');
    try {
      const res = await manifestsApi.createDispatch(id);
      const m = res?.data;
      if (m?.id) {
        window.open(`${API_BASE}/manifests/${m.id}/pdf`, '_blank');
        toast.success(`Bordereau ${m.number} genere`);
      }
      qc.invalidateQueries({ queryKey: ['containers', id, 'history'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Erreur lors de la generation du bordereau d'envoi");
    }
    setBusyManifest(null);
  };

  const handleGenerateReception = async () => {
    setBusyManifest('reception');
    try {
      const res = await manifestsApi.createReception(id);
      const m = res?.data;
      if (m?.id) {
        window.open(`${API_BASE}/manifests/${m.id}/pdf`, '_blank');
        toast.success(`Bordereau ${m.number} genere`);
      }
      qc.invalidateQueries({ queryKey: ['containers', id, 'history'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur lors de la generation du bordereau de reception');
    }
    setBusyManifest(null);
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
    { key: 'weight', label: 'Pesee', render: (row: any) =>
      row.weight ? `${Number(row.weight).toFixed(1)} kg` : row.volume ? `${Number(row.volume).toFixed(2)} m3` : '-',
    },
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
            ...(canUnload
              ? [{ label: 'Decharger', icon: <PackageMinus className="h-4 w-4" />, onClick: () => setUnloadTarget({ id: row.id, designation: row.designation }) }]
              : []),
          ]}
        />
      ),
    },
  ];

  const infoTab = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <AppCard>
          <p className="text-sm text-gray-500">Type</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-lg font-bold">{containerTypeLabel}</p>
            {container.isForwarding && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary-50 text-primary-700">Acheminement</span>
            )}
          </div>
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
          <p className="text-xs text-gray-400 mt-1">{Number(container.currentLoad).toFixed(capacityUnit === 'm3' ? 2 : 0)} / {Number(container.capacity).toFixed(capacityUnit === 'm3' ? 2 : 0)} {capacityUnit}</p>
        </AppCard>
        <AppCard>
          <p className="text-sm text-gray-500">Date creation</p>
          <p className="mt-1 text-lg font-bold">{formatDate(container.createdAt)}</p>
        </AppCard>
      </div>

      <AppCard>
        <AppCardHeader title="Bordereaux" description="Generation des bordereaux PDF" />
        <div className="flex flex-wrap gap-3">
          {(container.status === 'LOADING' || container.status === 'IN_TRANSIT' || container.status === 'ARRIVED' || container.status === 'UNLOADING' || container.status === 'UNLOADED') && (
            <AppButton variant="outline" size="sm" onClick={handleGenerateDispatch} loading={busyManifest === 'dispatch'}>
              <FileText className="h-4 w-4" />
              Bordereau d&apos;envoi
            </AppButton>
          )}
          {(container.status === 'ARRIVED' || container.status === 'UNLOADING' || container.status === 'UNLOADED') && (
            <>
              <AppButton variant="outline" size="sm" onClick={handleGenerateReception} loading={busyManifest === 'reception'}>
                <FileCheck className="h-4 w-4" />
                Bordereau de reception
              </AppButton>
              <AppButton variant="outline" size="sm" onClick={() => setShowComparison(true)}>
                <FileDiff className="h-4 w-4" />
                Bordereau de comparaison
              </AppButton>
            </>
          )}
        </div>
      </AppCard>

      <AppCard>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Colis dans le conteneur ({parcels.length})</h3>
          {canLoad && !isClosed && (
            <AppButton size="sm" onClick={() => setShowLoadDialog(true)}>
              <Plus className="h-3.5 w-3.5" />
              Charger des colis
            </AppButton>
          )}
          {(container.status === 'IN_TRANSIT' || container.status === 'UNLOADED') && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              {container.status === 'IN_TRANSIT' ? 'Conteneur en transit, chargement bloque' : 'Conteneur cloture, plus utilisable'}
            </span>
          )}
        </div>
        <AppDataTable columns={parcelColumns} data={parcels} onRowClick={(row) => router.push(`/parcels/${row.id}`)} />
      </AppCard>
    </div>
  );

  const historyTab = (
    <AppCard>
      <AppCardHeader title={`Historique du conteneur (${history.length} evenement${history.length > 1 ? 's' : ''})`} />
      {history.length === 0 ? (
        <div className="flex flex-col items-center py-8">
          <History className="h-10 w-10 text-gray-300" />
          <p className="mt-2 text-sm text-gray-400">Aucun historique</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-5 top-2 bottom-2 w-px bg-gray-200" />
          <div className="space-y-0">
            {history.map((entry, i) => (
              <div key={entry.id} className="relative flex gap-4 py-3">
                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center">
                  <div className={`h-3 w-3 rounded-full border-2 ${
                    i === 0 ? 'border-primary-500 bg-primary-500' : 'border-gray-300 bg-white'
                  }`} />
                </div>
                <div className="flex-1 rounded-xl bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">{ACTION_LABELS[entry.action] || entry.action}</p>
                    <span className="text-xs text-gray-400">{formatDateTime(entry.createdAt)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {entry.statusBefore && entry.statusAfter && entry.statusBefore !== entry.statusAfter && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <AppBadge variant="default">{STATUS_LABELS[entry.statusBefore] || entry.statusBefore}</AppBadge>
                        <span className="text-gray-400">→</span>
                        <AppBadge variant="success">{STATUS_LABELS[entry.statusAfter] || entry.statusAfter}</AppBadge>
                      </div>
                    )}
                    {entry.user && (
                      <span className="text-xs text-gray-500">par {entry.user.firstName} {entry.user.lastName}</span>
                    )}
                  </div>
                  {entry.comment && <p className="mt-1.5 text-xs text-gray-500 italic">{entry.comment}</p>}
                  {entry.changes && Object.keys(entry.changes).length > 0 && (
                    <details className="mt-1.5 text-xs text-gray-400">
                      <summary className="cursor-pointer hover:text-gray-600">Details</summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-[10px]">
                        {JSON.stringify(entry.changes, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppCard>
  );

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{container.designation}</h1>
                <StatusBadge status={container.status} type="container" />
                {container.isForwarding && (
                  <span className="text-[10px] font-semibold px-2 py-1 rounded bg-primary-100 text-primary-800 inline-flex items-center gap-1">
                    <Truck className="h-3 w-3" />
                    Acheminement
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {container.departureAgency?.name || '-'} → {container.arrivalAgency?.name || '-'}
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

        <AppTabs
          tabs={[
            { value: 'info', label: 'Informations', icon: <Package className="h-4 w-4" />, content: infoTab },
            { value: 'history', label: `Historique (${history.length})`, icon: <History className="h-4 w-4" />, content: historyTab },
          ]}
        />

        {/* Load parcels dialog */}
        <AppDialog
          open={showLoadDialog}
          onClose={() => { setShowLoadDialog(false); setSelectedParcelIds([]); }}
          title="Charger des colis"
          size="lg"
          footer={
            <>
              <AppButton variant="ghost" onClick={() => { setShowLoadDialog(false); setSelectedParcelIds([]); }}>Annuler</AppButton>
              <AppButton onClick={handleLoadParcels} loading={loadMutation.isPending} disabled={selectedParcelIds.length === 0}>
                <Package className="h-4 w-4" />
                Charger {selectedParcelIds.length} colis
              </AppButton>
            </>
          }
        >
          {(() => {
            const rows: any[] = availableParcels?.data || [];
            const meta = availableParcels?.meta || { total: 0, page: 1, totalPages: 1 };
            const selectableIds = rows.map((p) => p.id);
            const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedParcelIds.includes(id));
            const toggleAll = () => {
              if (allSelected) {
                setSelectedParcelIds((prev) => prev.filter((id) => !selectableIds.includes(id)));
              } else {
                setSelectedParcelIds((prev) => Array.from(new Set([...prev, ...selectableIds])));
              }
            };
            const isFiltered = parcelSearch.trim().length > 0;
            const empty = !loadingAvailable && rows.length === 0;
            return (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">
                  {container.isForwarding
                    ? `Conteneur d'acheminement : tous les types de colis sont acceptes.`
                    : `Seuls les colis ${containerTypeLabel.toLowerCase()} (${container.type}) sont affiches.`}
                </p>
                <AppInput
                  placeholder="Rechercher par tracking, designation, client..."
                  value={parcelSearch}
                  onChange={(e) => { setParcelSearch(e.target.value); setParcelPage(1); }}
                />
                <div className="max-h-96 overflow-y-auto border border-gray-100 rounded-xl">
                  {loadingAvailable ? (
                    <p className="p-4 text-sm text-gray-400">Chargement...</p>
                  ) : empty ? (
                    <div className="flex flex-col items-center gap-3 p-8 text-center">
                      <Package className="h-10 w-10 text-gray-300" />
                      <p className="text-sm text-gray-500">
                        {isFiltered
                          ? 'Aucun colis ne correspond a votre recherche'
                          : container.isForwarding
                            ? 'Aucun colis en stock disponible'
                            : `Aucun colis ${containerTypeLabel.toLowerCase()} en stock`}
                      </p>
                      <AppButton size="sm" onClick={() => setShowCreateParcel(true)}>
                        <Plus className="h-3.5 w-3.5" />
                        Nouveau colis {!container.isForwarding && containerType ? `(${TYPE_LABELS[containerType]})` : ''}
                      </AppButton>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="w-10 p-3">
                            <AppCheckbox
                              checked={allSelected}
                              onCheckedChange={toggleAll}
                            />
                          </th>
                          <th className="text-left p-3 font-medium text-gray-600">Tracking</th>
                          <th className="text-left p-3 font-medium text-gray-600">Designation</th>
                          <th className="text-left p-3 font-medium text-gray-600">Pesee</th>
                          <th className="text-left p-3 font-medium text-gray-600">Type</th>
                          <th className="text-left p-3 font-medium text-gray-600">Client</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {rows.map((p: any) => (
                          <tr
                            key={p.id}
                            className={`cursor-pointer transition-colors ${selectedParcelIds.includes(p.id) ? 'bg-primary-50' : 'hover:bg-primary-50/50'}`}
                            onClick={() => toggleParcelSelection(p.id)}
                          >
                            <td className="p-3">
                              <AppCheckbox
                                checked={selectedParcelIds.includes(p.id)}
                                onCheckedChange={() => toggleParcelSelection(p.id)}
                              />
                            </td>
                            <td className="p-3 font-mono text-xs font-bold text-primary-700">{p.trackingNumber}</td>
                            <td className="p-3">{p.designation}</td>
                            <td className="p-3">{p.weight ? `${Number(p.weight).toFixed(1)} kg` : p.volume ? `${Number(p.volume).toFixed(2)} m3` : '-'}</td>
                            <td className="p-3">
                              {p.transitRoute?.type ? (
                                <span className="text-gray-600">{TYPE_LABELS[p.transitRoute.type] || p.transitRoute.type}</span>
                              ) : '-'}
                            </td>
                            <td className="p-3">{p.client?.fullName || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-gray-500">
                    {selectedParcelIds.length > 0 && (
                      <span className="text-primary-700 font-medium mr-3">{selectedParcelIds.length} selectionne(s)</span>
                    )}
                    {!loadingAvailable && rows.length > 0 && (
                      <span>{meta.total} colis au total</span>
                    )}
                  </div>
                  {meta.totalPages > 1 && (
                    <div className="flex items-center gap-2 text-xs">
                      <AppButton variant="ghost" size="sm" disabled={parcelPage <= 1} onClick={() => setParcelPage((p) => Math.max(1, p - 1))}>
                        Precedent
                      </AppButton>
                      <span className="text-gray-500">Page {meta.page} / {meta.totalPages}</span>
                      <AppButton variant="ghost" size="sm" disabled={parcelPage >= meta.totalPages} onClick={() => setParcelPage((p) => p + 1)}>
                        Suivant
                      </AppButton>
                    </div>
                  )}
                  {!loadingAvailable && rows.length > 0 && (
                    <AppButton variant="outline" size="sm" onClick={() => setShowCreateParcel(true)}>
                      <Plus className="h-3.5 w-3.5" />
                      Nouveau colis
                    </AppButton>
                  )}
                </div>
              </div>
            );
          })()}
        </AppDialog>

        {/* Unload dialog */}
        <AppDialog
          open={!!unloadTarget}
          onClose={() => setUnloadTarget(null)}
          title={unloadTarget ? `Decharger ${unloadTarget.designation}` : 'Decharger'}
          size="md"
          footer={
            <>
              <AppButton variant="ghost" onClick={() => setUnloadTarget(null)}>Annuler</AppButton>
              <AppButton onClick={handleUnloadConfirm} loading={unloading}>
                <PackageMinus className="h-4 w-4" />
                Decharger
              </AppButton>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex gap-2">
              {(['received', 'modified', 'not_found'] as const).map((act) => (
                <button
                  key={act}
                  type="button"
                  onClick={() => setUnloadAction(act)}
                  className={`flex-1 rounded-xl border p-3 text-left text-sm transition-colors ${
                    unloadAction === act ? 'border-primary-500 bg-primary-50 text-primary-900' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-medium">
                    {act === 'received' ? 'Bien recu' : act === 'modified' ? 'Modifie' : 'Non trouve'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {act === 'received' ? 'Le colis arrive intact' : act === 'modified' ? 'Poids ou etat different' : 'Colis introuvable physiquement'}
                  </p>
                </button>
              ))}
            </div>

            {unloadAction !== 'not_found' && (
              <AppSearchSelect
                label="Magasin de destination"
                value={unloadWarehouseId}
                onChange={setUnloadWarehouseId}
                search={searchers.warehouses}
                placeholder="Selectionner un magasin"
                required
              />
            )}

            {unloadAction === 'modified' && (
              <AppInput
                label="Nouveau poids (kg)"
                type="number"
                step="0.1"
                value={unloadWeight}
                onChange={(e) => setUnloadWeight(e.target.value)}
              />
            )}

            <AppInput
              label="Commentaire (optionnel)"
              value={unloadComment}
              onChange={(e) => setUnloadComment(e.target.value)}
            />
          </div>
        </AppDialog>

        <ConfirmDialog
          open={showDepart}
          onClose={() => setShowDepart(false)}
          onConfirm={() => { departMutation.mutate(id); setShowDepart(false); }}
          title="Confirmer le depart"
          message={`Le conteneur ${container.designation} et ses ${parcels.length} colis passeront en transit. Plus aucun chargement ne sera possible. Cette action est irreversible.`}
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

        <ComparisonDialog
          open={showComparison}
          onClose={() => setShowComparison(false)}
          containerId={id}
          containerDesignation={container.designation}
        />

        <ParcelFormDialog
          open={showCreateParcel}
          onClose={() => {
            setShowCreateParcel(false);
            qc.invalidateQueries({ queryKey: ['parcels-available'] });
          }}
          defaultTransitType={container.isForwarding ? null : (container.type as 'AIR' | 'SEA' | 'LAND')}
        />
      </div>
    </PageTransition>
  );
}
