'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Package, Play, PackageCheck, Plus, Eye, PackageMinus,
  FileText, FileCheck, FileDiff, Printer, History, AlertCircle, Truck, Camera, QrCode, ChevronDown, FileSpreadsheet, Edit,
} from 'lucide-react';
import { ContainerFormDialog } from '@/app/(dashboard)/containers/ContainerFormDialog';
import { AppDropdownMenu } from '@/components/ui/AppDropdownMenu';
import { ParcelQRDialog } from '@/components/shared/ParcelQRDialog';
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
import { fetchPdfAuthed } from '@/lib/api/pdfDownload';
import {
  useContainer, useContainerParcels, useDepartContainer,
  useArriveContainer, useLoadParcels,
} from '@/lib/hooks/useContainers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { containersApi, manifestsApi } from '@/lib/api/containers';
import { searchers } from '@/lib/api/searchers';
import { formatAmount, formatDate, formatDateTime } from '@transitsoftservices/shared';
import { toast } from 'sonner';
import { ComparisonDialog } from './ComparisonDialog';
import { ParcelFormDialog } from '@/app/(dashboard)/parcels/ParcelFormDialog';
import { QRScannerDialog } from '@/components/shared/QRScannerDialog';
import { normalizeScannedTracking } from '@/lib/utils/scanNormalize';
import { LiveScanCollector } from '@/components/shared/LiveScanCollector';
import { ParcelPickerList } from '@/components/shared/ParcelPickerList';
import { AgencyAvatar } from '@/components/shared/AgencyAvatar';
import { ContainerExpensesTab } from './ContainerExpensesTab';
import { ContainerDocumentsTab } from './ContainerDocumentsTab';
import { ContainerLinksGraph } from './ContainerLinksGraph';
import { HandCoins, Paperclip } from 'lucide-react';
import { Can } from '@/lib/components/Can';
import { usePermission } from '@/lib/hooks/usePermission';

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

// Sequence canonique des statuts conteneur, utilisee par le stepper.
const CONTAINER_STATUS_STEPS = ['EMPTY', 'LOADING', 'IN_TRANSIT', 'RECEIVED', 'UNLOADED'] as const;
const CONTAINER_STEP_LABELS: Record<string, string> = {
  EMPTY: 'Vide',
  LOADING: 'Chargement',
  IN_TRANSIT: 'En transit',
  RECEIVED: 'Receptionne',
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
  UNLOADED: 'Conteneur cloture (tous decharges)',
  PARCEL_UNLOADED_RECEIVED: 'Colis decharge (recu)',
  PARCEL_UNLOADED_MODIFIED: 'Colis decharge (modifie)',
  PARCEL_UNLOADED_NOT_FOUND: 'Colis non retrouve au dechargement',
  DISPATCH_MANIFEST_CREATED: "Bordereau d'envoi genere",
  RECEPTION_MANIFEST_CREATED: 'Bordereau de reception genere',
  DISCREPANCY_MISSING: 'Ecart : colis manquant',
  DISCREPANCY_EXTRA: 'Ecart : colis trouve en plus',
};

export default function ContainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();

  // Permissions ABAC : cycle de vie conteneur (chargement, depart, arrivee,
  // dechargement, edition) et gestion des manifestes / ecarts.
  const canManageContainer = usePermission('container.manage');
  const canManageManifest = usePermission('manifest.manage');

  const { data, isLoading } = useContainer(id);
  const { data: parcelsData } = useContainerParcels(id);
  const { data: historyData } = useQuery({
    queryKey: ['containers', id, 'history'],
    queryFn: () => containersApi.history(id),
    enabled: !!id,
  });

  // Historique des bordereaux : tous les bordereaux generes pour ce conteneur,
  // toutes versions confondues. Chaque appel a createDispatch / createReception
  // cree un nouvel enregistrement (suffixe #2, #3 ajoute si meme nom), ce qui
  // forme naturellement un historique.
  const { data: manifestsHistory } = useQuery({
    queryKey: ['containers', id, 'manifests-history'],
    queryFn: () => manifestsApi.list({ containerId: id, limit: 100 }),
    enabled: !!id,
  });

  const departMutation = useDepartContainer();
  const arriveMutation = useArriveContainer();
  const loadMutation = useLoadParcels();

  const [showDepart, setShowDepart] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showArrive, setShowArrive] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [unloadTarget, setUnloadTarget] = useState<{ id: string; designation: string } | null>(null);
  const [unloadAction, setUnloadAction] = useState<'received' | 'not_found' | 'modified'>('received');
  const [unloadWarehouseId, setUnloadWarehouseId] = useState<string | null>(null);
  const [unloadWeight, setUnloadWeight] = useState('');
  const [unloadComment, setUnloadComment] = useState('');
  const [unloading, setUnloading] = useState(false);
  const [missingTarget, setMissingTarget] = useState<{ id: string; designation: string } | null>(null);
  const [markingMissing, setMarkingMissing] = useState(false);
  const [selectedParcelIds, setSelectedParcelIds] = useState<string[]>([]);
  const [parcelSearch, setParcelSearch] = useState('');
  const [parcelPage, setParcelPage] = useState(1);
  // Filtre magasin source : pre-rempli avec un magasin de l'agence de depart
  // a l'ouverture du dialog (voir useEffect plus bas). Permet au magasinier
  // d'isoler ses colis avant chargement.
  const [loadSourceWarehouseId, setLoadSourceWarehouseId] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [showCreateParcel, setShowCreateParcel] = useState(false);
  const [busyManifest, setBusyManifest] = useState<'dispatch' | 'reception' | null>(null);
  const [scanInput, setScanInput] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  // Scan live dechargement : tout en "received" vers un magasin selectionne.
  const [showBatchUnload, setShowBatchUnload] = useState(false);
  // IDs selectionnes manuellement (cas etiquettes defectueuses).
  const [batchUnloadManualIds, setBatchUnloadManualIds] = useState<string[]>([]);
  const [batchUnloadWarehouseId, setBatchUnloadWarehouseId] = useState<string | null>(null);
  const [batchUnloadBusy, setBatchUnloadBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; designation: string } | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [removing, setRemoving] = useState(false);
  const [qrParcel, setQrParcel] = useState<any | null>(null);

  const PARCEL_PAGE_SIZE = 20;
  const containerType = data?.data?.type as 'AIR' | 'SEA' | 'LAND' | undefined;
  const isForwarding = !!data?.data?.isForwarding;

  const { data: availableParcels, isLoading: loadingAvailable } = useQuery({
    queryKey: ['containers', id, 'loadable', parcelSearch, parcelPage, loadSourceWarehouseId],
    queryFn: () => apiClient.get(`/containers/${id}/loadable-parcels`, {
      params: {
        page: parcelPage,
        limit: PARCEL_PAGE_SIZE,
        search: parcelSearch || undefined,
        warehouseId: loadSourceWarehouseId || undefined,
      },
    }).then((r) => r.data),
    enabled: showLoadDialog && !!containerType,
  });

  const container = data?.data;
  const parcels = parcelsData?.data || [];
  const history = historyData?.data || [];

  // Pre-selection du magasin source a l'ouverture du dialog de chargement :
  // on prend le premier magasin de l'agence de depart si aucun n'est encore
  // selectionne. Si l'utilisateur change explicitement, on respecte son choix.
  useEffect(() => {
    if (!showLoadDialog) return;
    if (loadSourceWarehouseId) return;
    const depAgencyId = container?.departureAgencyId || container?.departureAgency?.id;
    if (!depAgencyId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/warehouses', { params: { agencyId: depAgencyId, limit: 1 } });
        const first = (res.data?.data || [])[0];
        if (!cancelled && first?.id) setLoadSourceWarehouseId(first.id);
      } catch {
        // Pas de magasin pre-rempli : l'utilisateur pourra en choisir un
        // manuellement, ou laisser vide (= tous les magasins de l'agence).
      }
    })();
    return () => { cancelled = true; };
  }, [showLoadDialog, container?.departureAgencyId, container?.departureAgency?.id, loadSourceWarehouseId]);

  // Benefice : pour les conteneurs non-acheminement, valeur des colis -
  // total des depenses (payees + non payees, hors annulees).
  // Hook declare ICI (avant les early returns) pour respecter l'ordre des
  // hooks React. enabled gere l'execution effective.
  const { data: containerExpensesData } = useQuery({
    queryKey: ['containers', id, 'expenses', 'for-benefice'],
    queryFn: () => apiClient.get(`/expenses/container/${id}`).then((r) => r.data),
    enabled: !!id && !container?.isForwarding,
  });
  // Snapshot des colis a l'arrivee = colis charges dans ce conteneur (encore
  // presents + deja decharges). Sert au benefice : la valeur des colis ne
  // doit pas baisser au fur et a mesure du dechargement.
  const { data: arrivalSnapshotData } = useQuery({
    queryKey: ['containers', id, 'arrival-snapshot'],
    queryFn: () => apiClient.get(`/containers/${id}/arrival-snapshot`).then((r) => r.data),
    enabled: !!id && !container?.isForwarding,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (!container) return <p className="p-6 text-gray-500">Conteneur introuvable</p>;

  const loadPercent = Number(container.capacity) > 0
    ? Math.round((Number(container.currentLoad) / Number(container.capacity)) * 100)
    : 0;
  const capacityUnit = container.type === 'AIR' ? 'kg' : 'm3';
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

  const submitScan = async (raw: string) => {
    const v = normalizeScannedTracking(raw);
    if (!v) return;
    setScanBusy(true);
    try {
      const res = await containersApi.loadByQr(id, v);
      const ok = res?.data?.success;
      if (ok) {
        toast.success(`Charge : ${res.data.trackingNumber}`);
        setScanInput('');
        qc.invalidateQueries({ queryKey: ['containers', id] });
        qc.invalidateQueries({ queryKey: ['containers', id, 'parcels'] });
        qc.invalidateQueries({ queryKey: ['containers', id, 'loadable'] });
      } else {
        toast.error(res?.data?.reason || 'Echec du chargement');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Colis introuvable');
    }
    setScanBusy(false);
  };

  const handleScan = () => submitScan(scanInput);

  // Scan live chargement : un appel reseau par scan, anti-doublon 2 min dans
  // LiveScanCollector. Retourne { ok, label, reason } -- les sons/toasts sont
  // joues par le collector lui-meme.
  const handleLiveLoad = async (code: string) => {
    const res = await containersApi.loadByQr(id, code);
    const success = !!res?.data?.success;
    if (success) {
      qc.invalidateQueries({ queryKey: ['containers', id] });
      qc.invalidateQueries({ queryKey: ['containers', id, 'parcels'] });
      qc.invalidateQueries({ queryKey: ['containers', id, 'loadable'] });
    }
    return { ok: success, label: res?.data?.trackingNumber, reason: res?.data?.reason };
  };

  // Variante "by IDs" pour la selection manuelle dans la liste paginee
  // (etiquette defectueuse). Reutilise la meme logique mais sans chercher
  // par tracking : les ids sont deja resolus.
  const handleBatchUnloadByIds = async (ids: string[]) => {
    if (!batchUnloadWarehouseId) {
      toast.error('Selectionnez un magasin de destination');
      return;
    }
    if (ids.length === 0) return;
    setBatchUnloadBusy(true);
    let ok = 0;
    const failed: { id: string; reason: string }[] = [];
    for (const pid of ids) {
      try {
        await containersApi.unload(id, {
          parcelId: pid,
          action: 'received',
          warehouseId: batchUnloadWarehouseId,
        });
        ok++;
      } catch (e: any) {
        failed.push({ id: pid, reason: e?.response?.data?.message || 'echec' });
      }
    }
    setBatchUnloadBusy(false);
    if (ok > 0) toast.success(`${ok} colis decharge${ok > 1 ? 's' : ''}`);
    if (failed.length > 0) toast.error(`${failed.length} echec(s) : ${failed[0].reason}`);
    qc.invalidateQueries({ queryKey: ['containers', id] });
    qc.invalidateQueries({ queryKey: ['containers', id, 'parcels'] });
    qc.invalidateQueries({ queryKey: ['parcels'] });
    if (failed.length === 0) {
      setShowBatchUnload(false);
      setBatchUnloadManualIds([]);
    } else {
      setBatchUnloadManualIds(failed.map((f) => f.id));
    }
  };

  // Scan live dechargement : un appel reseau par scan. Resout tracking ->
  // parcelId via la liste des colis presents dans le conteneur (les QR
  // encodent une URL, deja normalisee par LiveScanCollector).
  const handleLiveUnload = async (code: string) => {
    if (!batchUnloadWarehouseId) {
      return { ok: false, reason: 'Selectionnez un magasin de destination' };
    }
    const match = parcels.find((p: any) => p.trackingNumber === code);
    if (!match) {
      return { ok: false, reason: 'Non present dans ce conteneur' };
    }
    await containersApi.unload(id, {
      parcelId: match.id,
      action: 'received',
      warehouseId: batchUnloadWarehouseId,
    });
    qc.invalidateQueries({ queryKey: ['containers', id] });
    qc.invalidateQueries({ queryKey: ['containers', id, 'parcels'] });
    qc.invalidateQueries({ queryKey: ['containers', id, 'history'] });
    qc.invalidateQueries({ queryKey: ['parcels'] });
    return { ok: true, label: code };
  };

  const handleRemoveConfirm = async () => {
    if (!removeTarget) return;
    if (removeReason.trim().length < 2) {
      toast.error('Indiquez la raison du retrait');
      return;
    }
    setRemoving(true);
    try {
      await containersApi.removeParcel(id, removeTarget.id, removeReason.trim());
      toast.success('Colis retire du conteneur');
      setRemoveTarget(null);
      setRemoveReason('');
      qc.invalidateQueries({ queryKey: ['containers', id] });
      qc.invalidateQueries({ queryKey: ['containers', id, 'parcels'] });
      qc.invalidateQueries({ queryKey: ['containers', id, 'history'] });
      qc.invalidateQueries({ queryKey: ['containers', id, 'loadable'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Retrait impossible');
    }
    setRemoving(false);
  };

  const handleMarkMissingConfirm = async () => {
    if (!missingTarget) return;
    setMarkingMissing(true);
    try {
      await apiClient.post(`/manifests/discrepancies/${id}/parcels/${missingTarget.id}/missing`, {});
      toast.success('Colis marque non recu (manquant physique)');
      setMissingTarget(null);
      qc.invalidateQueries({ queryKey: ['containers', id] });
      qc.invalidateQueries({ queryKey: ['containers', id, 'parcels'] });
      qc.invalidateQueries({ queryKey: ['containers', id, 'history'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Operation impossible');
    }
    setMarkingMissing(false);
  };

  // Le manifest record est independant du format de telechargement : on
  // genere une fois cote backend (cree le snapshot des lignes) puis on
  // propose au choix le PDF ou le XLSX. Les deux versions restent
  // accessibles dans l'historique via les memes endpoints
  // /manifests/:id/pdf et /manifests/:id/xlsx.
  const downloadManifest = async (m: { id: string; number: string }, format: 'pdf' | 'xlsx') => {
    if (format === 'xlsx') {
      await fetchPdfAuthed(`/manifests/${m.id}/xlsx`, {
        fileName: `bordereau-${m.number}.xlsx`,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    } else {
      await fetchPdfAuthed(`/manifests/${m.id}/pdf`, { fileName: `bordereau-${m.number}.pdf` });
    }
  };

  const handleGenerateDispatch = async (format: 'pdf' | 'xlsx' = 'pdf') => {
    setBusyManifest('dispatch');
    try {
      const res = await manifestsApi.createDispatch(id);
      const m = res?.data;
      if (m?.id) {
        await downloadManifest(m, format);
        toast.success(`Bordereau ${m.number} genere (${format.toUpperCase()})`);
      }
      qc.invalidateQueries({ queryKey: ['containers', id, 'history'] });
      qc.invalidateQueries({ queryKey: ['containers', id, 'manifests-history'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Erreur lors de la generation du bordereau d'envoi");
    }
    setBusyManifest(null);
  };

  const handleGenerateReception = async (format: 'pdf' | 'xlsx' = 'pdf') => {
    setBusyManifest('reception');
    try {
      const res = await manifestsApi.createReception(id);
      const m = res?.data;
      if (m?.id) {
        await downloadManifest(m, format);
        toast.success(`Bordereau ${m.number} genere (${format.toUpperCase()})`);
      }
      qc.invalidateQueries({ queryKey: ['containers', id, 'history'] });
      qc.invalidateQueries({ queryKey: ['containers', id, 'manifests-history'] });
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
    {
      key: 'weight',
      label: 'Masse / Volume',
      render: (row: any) => (
        <div className="flex flex-col text-sm">
          {row.weight != null && <span className="text-gray-900">{Number(row.weight).toFixed(1)} kg</span>}
          {row.volume != null && <span className="text-xs text-gray-500">{Number(row.volume).toFixed(3)} m3</span>}
          {row.weight == null && row.volume == null && <span className="text-xs text-gray-300">-</span>}
        </div>
      ),
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
            { label: 'QR / Etiquette', icon: <QrCode className="h-4 w-4" />, onClick: () => setQrParcel(row) },
            ...(canManageContainer && container.status === 'LOADING'
              ? [{
                  label: 'Retirer (chargement par erreur)',
                  icon: <PackageMinus className="h-4 w-4" />,
                  onClick: () => { setRemoveTarget({ id: row.id, designation: row.designation }); setRemoveReason(''); },
                }]
              : []),
            ...(canManageContainer && canUnload
              ? [{ label: 'Decharger', icon: <PackageMinus className="h-4 w-4" />, onClick: () => setUnloadTarget({ id: row.id, designation: row.designation }) }]
              : []),
            ...(canManageManifest && (container.status === 'IN_TRANSIT' || container.status === 'RECEIVED') && row.status !== 'LOST'
              ? [{
                  label: 'Marquer non recu',
                  icon: <AlertCircle className="h-4 w-4" />,
                  variant: 'destructive' as const,
                  onClick: () => setMissingTarget({ id: row.id, designation: row.designation }),
                }]
              : []),
          ]}
        />
      ),
    },
  ];

  const expensesForBenefice: any[] = containerExpensesData?.data ?? [];
  // Snapshot = tous les colis charges dans ce conteneur (etat fige a partir
  // du depart). Recu = snapshot moins les colis marques LOST (non recus).
  // La valeur facturable du conteneur (et donc le benefice) est calculee
  // sur les colis REELLEMENT RECUS, pas sur le total envoye : un colis
  // perdu ne genere pas de revenu pour ce conteneur.
  const arrivalSnapshot: any[] = arrivalSnapshotData?.data ?? [];
  const receivedParcels = arrivalSnapshot.filter((p: any) => p.status !== 'LOST');
  const lostCount = arrivalSnapshot.length - receivedParcels.length;
  const parcelsValueTotal = receivedParcels.reduce((s: number, p: any) => s + Number(p.price ?? 0), 0);
  const expensesTotal = expensesForBenefice.reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const benefice = parcelsValueTotal - expensesTotal;

  const infoTab = (
    <div className="space-y-6">
      {!container.isForwarding && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AppCard>
            <p className="text-sm text-gray-500">Valeur colis recus</p>
            <p className="mt-1 text-lg font-bold text-green-600">+{formatAmount(parcelsValueTotal)}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {arrivalSnapshot.length} envoye(s){' · '}
              <span className="text-emerald-700">{receivedParcels.length} recu(s)</span>
              {lostCount > 0 && <> · <span className="text-red-600">{lostCount} non recu(s)</span></>}
            </p>
          </AppCard>
          <AppCard>
            <p className="text-sm text-gray-500">Total depenses</p>
            <p className="mt-1 text-lg font-bold text-red-600">-{formatAmount(expensesTotal)}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{expensesForBenefice.length} depense(s)</p>
          </AppCard>
          <AppCard>
            <p className="text-sm text-gray-500">Benefice estime</p>
            <p className={`mt-1 text-lg font-bold ${benefice >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatAmount(benefice)}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">valeur colis - depenses</p>
          </AppCard>
        </div>
      )}

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
        <AppCard>
          <p className="text-sm text-gray-500">Date de depart</p>
          <p className="mt-1 text-lg font-bold">
            {container.departureDate ? formatDate(container.departureDate) : '-'}
          </p>
        </AppCard>
        <AppCard>
          <p className="text-sm text-gray-500">Date d&apos;arrivee</p>
          <p className="mt-1 text-lg font-bold">
            {container.actualArrivalDate
              ? formatDate(container.actualArrivalDate)
              : container.estimatedArrivalDate
                ? formatDate(container.estimatedArrivalDate)
                : '-'}
          </p>
          {!container.actualArrivalDate && container.estimatedArrivalDate && (
            <p className="text-[11px] text-gray-400 mt-0.5">estimee</p>
          )}
        </AppCard>
      </div>

      <ContainerLinksGraph container={container as any} />

      {/* Liste structuree des conteneurs parents pour acheminement.
          Affiche designation + statut + nombre de colis communs. Lien
          vers chaque parent. */}
      {container.isForwarding && Array.isArray(container.forwardingParents) && container.forwardingParents.length > 0 && (
        <AppCard>
          <AppCardHeader
            title={`Conteneurs parents (${container.forwardingParents.length})`}
            description="Conteneurs sources des colis regroupes dans cet acheminement. Les depenses se propagent au prorata des prix snapshotes."
          />
          <ul className="divide-y divide-gray-100">
            {container.forwardingParents.map((fp: any) => (
              <li key={fp.parentId} className="flex items-center justify-between gap-3 py-2">
                <Link
                  href={`/containers/${fp.parent.id}`}
                  className="flex items-center gap-2 text-sm font-medium text-primary-700 hover:underline"
                >
                  <Truck className="h-4 w-4" />
                  {fp.parent.designation}
                  <StatusBadge status={fp.parent.status} type="container" />
                </Link>
                <span className="text-xs text-gray-600">
                  <strong>{fp.parcelCount}</strong> colis en commun
                </span>
              </li>
            ))}
          </ul>
        </AppCard>
      )}

      <AppCard>
        <AppCardHeader
          title="Bordereaux"
          description={`Generation des bordereaux PDF (statut conteneur : ${container.status})`}
        />
        {/* Boutons toujours rendus (sauf si conteneur EMPTY = aucun colis
            jamais charge). On desactive selon statut/historique au lieu de
            cacher : c'est plus clair pour l'utilisateur et evite les bugs
            "ou sont passes les boutons ?" post-dechargement.
            Audit fix #3 : ARRIVED + UNLOADING legacy ont ete migres vers
            RECEIVED. Le backend cherche les parcels via containerId OR
            lastContainerId pour les deux types de bordereau (cf.
            PrismaManifestRepository) -- on peut donc generer apres
            dechargement complet. */}
        {container.status !== 'EMPTY' ? (
          <div className="flex flex-wrap gap-3">
            {/* AppDropdownMenu : un seul bouton + chevron qui ouvre le
                choix PDF / XLSX. Le manifest record est cree une fois ;
                seul le format de telechargement differe. Les deux formats
                restent disponibles dans l'historique. */}
            <Can permission="manifest.manage">
              <AppDropdownMenu
                trigger={
                  <AppButton
                    variant="outline"
                    size="sm"
                    loading={busyManifest === 'dispatch'}
                  >
                    <FileText className="h-4 w-4" />
                    Bordereau d&apos;envoi
                    <ChevronDown className="h-3.5 w-3.5" />
                  </AppButton>
                }
                items={[
                  {
                    label: 'Generer PDF',
                    icon: <FileText className="h-4 w-4" />,
                    onClick: () => handleGenerateDispatch('pdf'),
                  },
                  {
                    label: 'Generer XLSX',
                    icon: <FileSpreadsheet className="h-4 w-4" />,
                    onClick: () => handleGenerateDispatch('xlsx'),
                  },
                ]}
              />
            </Can>

            {/* Bordereau de reception : reserve a UNLOADED. */}
            <Can permission="manifest.manage">
              <AppDropdownMenu
                trigger={
                  <AppButton
                    variant="outline"
                    size="sm"
                    loading={busyManifest === 'reception'}
                    disabled={container.status !== 'UNLOADED'}
                    title={
                      container.status !== 'UNLOADED'
                        ? 'Disponible uniquement quand le conteneur est entierement vide (statut UNLOADED).'
                        : undefined
                    }
                  >
                    <FileCheck className="h-4 w-4" />
                    Bordereau de reception
                    <ChevronDown className="h-3.5 w-3.5" />
                  </AppButton>
                }
                items={[
                  {
                    label: 'Generer PDF',
                    icon: <FileText className="h-4 w-4" />,
                    onClick: () => handleGenerateReception('pdf'),
                    disabled: container.status !== 'UNLOADED',
                  },
                  {
                    label: 'Generer XLSX',
                    icon: <FileSpreadsheet className="h-4 w-4" />,
                    onClick: () => handleGenerateReception('xlsx'),
                    disabled: container.status !== 'UNLOADED',
                  },
                ]}
              />
            </Can>

            <AppButton
              variant="outline"
              size="sm"
              onClick={() => setShowComparison(true)}
              disabled={container.status !== 'UNLOADED'}
              title={
                container.status !== 'UNLOADED'
                  ? 'Disponible uniquement apres dechargement complet (statut UNLOADED).'
                  : undefined
              }
            >
              <FileDiff className="h-4 w-4" />
              Bordereau de comparaison
            </AppButton>
          </div>
        ) : (
          <p className="text-xs text-amber-700">
            Aucun colis charge dans ce conteneur : les bordereaux sont indisponibles tant qu&apos;aucun colis n&apos;a ete charge.
          </p>
        )}

        {/* Historique : chaque generation produit un nouveau bordereau. On les
            liste du plus recent au plus ancien, avec les ecarts (status) et un
            telechargement PDF par version. */}
        {(() => {
          const list = (manifestsHistory?.data || []) as any[];
          if (list.length === 0) return null;

          // Ordonne par date desc puis groupe par type pour numeroter les versions
          // (v1 = plus ancien, vN = plus recent par type) cote affichage.
          const sorted = [...list].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
          const byType = new Map<string, number>();
          // Compte total par type pour calculer "v X / total"
          const totalByType = sorted.reduce<Record<string, number>>((acc, m) => {
            acc[m.type] = (acc[m.type] || 0) + 1;
            return acc;
          }, {});

          const handleDownload = async (manifestId: string, manifestNumber: string) => {
            try {
              await fetchPdfAuthed(`/manifests/${manifestId}/pdf`, { fileName: `${manifestNumber}.pdf` });
            } catch {
              toast.error('Erreur lors du telechargement');
            }
          };
          const handleDownloadXlsx = async (manifestId: string, manifestNumber: string) => {
            try {
              // Reutilise fetchPdfAuthed : meme logique (GET authentifie + blob download),
              // l'extension du fichier suffit pour qu'Excel ouvre correctement.
              await fetchPdfAuthed(`/manifests/${manifestId}/xlsx`, {
                fileName: `${manifestNumber}.xlsx`,
                mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              });
            } catch {
              toast.error('Erreur lors du telechargement XLSX');
            }
          };

          return (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                Historique ({sorted.length} version{sorted.length > 1 ? 's' : ''})
              </h4>
              <div className="overflow-hidden rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="p-2 text-left">Version</th>
                      <th className="p-2 text-left">Type</th>
                      <th className="p-2 text-left">Numero</th>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-right">Lignes</th>
                      <th className="p-2 text-left">Statut</th>
                      <th className="p-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sorted.map((m) => {
                      // Position decroissante par type : la plus recente a le numero le plus haut.
                      const seen = byType.get(m.type) || 0;
                      byType.set(m.type, seen + 1);
                      const versionNumber = (totalByType[m.type] || 1) - seen;
                      const total = totalByType[m.type];
                      const isLatest = versionNumber === total;
                      return (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="p-2">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${isLatest ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-600'}`}>
                                v{versionNumber}/{total}
                              </span>
                              {isLatest && <span className="text-[10px] text-primary-700">actuelle</span>}
                            </span>
                          </td>
                          <td className="p-2">
                            {m.type === 'DISPATCH' ? (
                              <span className="inline-flex items-center gap-1 text-xs">
                                <FileText className="h-3 w-3" />
                                Envoi
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs">
                                <FileCheck className="h-3 w-3" />
                                Reception
                              </span>
                            )}
                          </td>
                          <td className="p-2 font-mono text-xs text-gray-700">{m.number}</td>
                          <td className="p-2 text-xs text-gray-600">{formatDateTime(m.createdAt)}</td>
                          <td className="p-2 text-right text-xs">{m._count?.lines ?? m.lines?.length ?? '-'}</td>
                          <td className="p-2">
                            {m.status === 'ACTIVE' && <AppBadge variant="success">Active</AppBadge>}
                            {m.status === 'ARCHIVED' && <AppBadge variant="default">Archivee</AppBadge>}
                            {m.status === 'CANCELLED' && <AppBadge variant="error">Annulee</AppBadge>}
                          </td>
                          <td className="p-2 text-right">
                            <div className="flex justify-end gap-1">
                              <AppButton
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDownload(m.id, m.number)}
                                title="Telecharger le PDF"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                PDF
                              </AppButton>
                              <AppButton
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDownloadXlsx(m.id, m.number)}
                                title="Telecharger XLSX"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                XLSX
                              </AppButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </AppCard>

      <AppCard>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Colis dans le conteneur ({parcels.length})</h3>
          <div className="flex flex-wrap items-center gap-2">
            {canManageContainer && canLoad && !isClosed && (
              <AppButton size="sm" onClick={() => setShowLoadDialog(true)}>
                <Plus className="h-3.5 w-3.5" />
                Charger des colis
              </AppButton>
            )}
            {canManageContainer && canUnload && parcels.length > 0 && (
              <AppButton size="sm" variant="outline" onClick={() => setShowBatchUnload(true)}>
                <Camera className="h-3.5 w-3.5" />
                Decharger par scan
              </AppButton>
            )}
          </div>
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
              <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                <AgencyAvatar agency={container.departureAgency} size={20} rounded="md" />
                <span>{container.departureAgency?.name || '-'}</span>
                <span className="text-gray-300">→</span>
                <AgencyAvatar agency={container.arrivalAgency} size={20} rounded="md" />
                <span>{container.arrivalAgency?.name || '-'}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {canManageContainer && (container.status === 'EMPTY' || container.status === 'LOADING') && (
              <AppButton variant="outline" onClick={() => setShowEdit(true)}>
                <Edit className="h-4 w-4" />
                Modifier
              </AppButton>
            )}
            {canManageContainer && container.status === 'LOADING' && (
              <AppButton onClick={() => setShowDepart(true)}>
                <Play className="h-4 w-4" />
                Depart
              </AppButton>
            )}
            {canManageContainer && container.status === 'IN_TRANSIT' && (
              <AppButton onClick={() => setShowArrive(true)}>
                <PackageCheck className="h-4 w-4" />
                Arrivee
              </AppButton>
            )}
          </div>
        </div>

        {/* Stepper du statut conteneur (analogue a celui des colis pour montrer
            la progression visuellement). Statuts canoniques :
            EMPTY -> LOADING -> IN_TRANSIT -> RECEIVED -> UNLOADED. */}
        <AppCard>
          <div className="flex items-center justify-between px-2">
            {CONTAINER_STATUS_STEPS.map((step, i) => {
              const currentIdx = CONTAINER_STATUS_STEPS.indexOf(container.status);
              const isCompleted = i <= currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <div key={step} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-all ${
                        isCompleted ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-400'
                      } ${isCurrent ? 'ring-4 ring-primary-100 scale-110' : ''}`}
                    >
                      {i + 1}
                    </div>
                    <span
                      className={`mt-2 text-[10px] font-medium ${isCompleted ? 'text-primary-700' : 'text-gray-400'}`}
                    >
                      {CONTAINER_STEP_LABELS[step]}
                    </span>
                  </div>
                  {i < CONTAINER_STATUS_STEPS.length - 1 && (
                    <div
                      className={`mx-2 h-0.5 flex-1 rounded-full ${i < currentIdx ? 'bg-primary-500' : 'bg-gray-200'}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </AppCard>

        <AppTabs
          tabs={[
            { value: 'info', label: 'Informations', icon: <Package className="h-4 w-4" />, content: infoTab },
            { value: 'expenses', label: 'Depenses', icon: <HandCoins className="h-4 w-4" />, content: <ContainerExpensesTab containerId={id} /> },
            { value: 'documents', label: 'Documents', icon: <Paperclip className="h-4 w-4" />, content: <ContainerDocumentsTab containerId={id} /> },
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
                    : `Seuls les colis ${containerTypeLabel.toLowerCase()} sont affiches.`}
                  {' '}Les colis a destination de l&apos;agence de depart sont masques. Ordre : payes en priorite, puis les non-payes du plus ancien au plus recent.
                </p>
                <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-3">
                  <LiveScanCollector
                    onScan={handleLiveLoad}
                    placeholder="Scanner ou coller un QR / tracking..."
                    helperText="Chaque scan est envoye immediatement. Re-scan du meme colis ignore pendant 2 minutes."
                    cameraTitle="Scanner pour charger"
                  />
                </div>
                <AppSearchSelect
                  label="Magasin source (optionnel)"
                  value={loadSourceWarehouseId}
                  onChange={(v) => { setLoadSourceWarehouseId(v); setParcelPage(1); }}
                  // Restreint aux magasins de l'agence de depart : on ne
                  // peut charger que des colis physiquement presents sur le
                  // site de depart du conteneur.
                  search={(q, limit) =>
                    searchers.warehouses(q, limit, {
                      agencyId: container.departureAgencyId || container.departureAgency?.id,
                    })
                  }
                  placeholder="Tous les magasins de l'agence de depart"
                  clearable
                />
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
                          <th className="w-10 p-3" onClick={(e) => e.stopPropagation()}>
                            <AppCheckbox
                              checked={allSelected}
                              onCheckedChange={toggleAll}
                            />
                          </th>
                          <th className="text-left p-3 font-medium text-gray-600">Tracking</th>
                          <th className="text-left p-3 font-medium text-gray-600">Paiement</th>
                          <th className="text-left p-3 font-medium text-gray-600">Designation</th>
                          <th className="text-left p-3 font-medium text-gray-600">Destination</th>
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
                            <td className="p-3" onClick={(e) => e.stopPropagation()}>
                              <AppCheckbox
                                checked={selectedParcelIds.includes(p.id)}
                                onCheckedChange={() => toggleParcelSelection(p.id)}
                              />
                            </td>
                            <td className="p-3 font-mono text-xs font-bold text-primary-700">{p.trackingNumber}</td>
                            <td className="p-3">
                              {(() => {
                                const st = p.invoice?.status;
                                if (st === 'PAID') return <AppBadge variant="success">Paye</AppBadge>;
                                if (st === 'PARTIAL') return <AppBadge variant="warning">Partiel</AppBadge>;
                                if (st === 'CANCELLED') return <AppBadge variant="default">Annule</AppBadge>;
                                return <AppBadge variant="error">Impaye</AppBadge>;
                              })()}
                            </td>
                            <td className="p-3">{p.designation}</td>
                            <td className="p-3">
                              <div className="flex flex-col text-xs">
                                <span className="text-gray-900 font-medium">{p.destinationAgency?.city || p.destination || '-'}</span>
                                {p.destinationAgency?.name && (
                                  <span className="text-gray-400 text-[10px]">{p.destinationAgency.name}</span>
                                )}
                              </div>
                            </td>
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
                // Restreint aux magasins de l'agence d'arrivee du conteneur :
                // un dechargement ne peut pas ranger les colis dans un magasin
                // d'une autre agence (incoherence physique).
                search={(q, limit) =>
                  searchers.warehouses(q, limit, {
                    agencyId: container.arrivalAgencyId || container.arrivalAgency?.id,
                  })
                }
                placeholder={`Magasin de ${container.arrivalAgency?.name || "l'agence d'arrivee"}`}
                required
              />
            )}

            {unloadAction === 'modified' && (
              <AppInput
                label="Nouveau poids (kg)"
                type="number"
                step="0.0001"
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

        {/* Dechargement batch par scan : tous les colis vers le meme magasin
            avec action "received". Pour les cas modified / not_found, il faut
            passer par le dechargement individuel (action ligne par ligne). */}
        <AppDialog
          open={showBatchUnload}
          onClose={() => {
            setShowBatchUnload(false);
            setBatchUnloadManualIds([]);
            setBatchUnloadWarehouseId(null);
          }}
          title="Decharger des colis"
          size="xl"
          footer={
            batchUnloadManualIds.length > 0 ? (
              <>
                <AppButton variant="ghost" onClick={() => setBatchUnloadManualIds([])}>
                  Vider la selection
                </AppButton>
                <AppButton
                  onClick={() => handleBatchUnloadByIds(batchUnloadManualIds)}
                  loading={batchUnloadBusy}
                  disabled={!batchUnloadWarehouseId}
                >
                  <PackageCheck className="h-4 w-4" />
                  Decharger {batchUnloadManualIds.length} colis selectionnes
                </AppButton>
              </>
            ) : undefined
          }
        >
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Tous les colis seront decharges comme &quot;bien recus&quot; vers le magasin selectionne.
              Pour signaler un colis modifie ou introuvable, utilisez le dechargement individuel.
            </p>
            <AppSearchSelect
              label="Magasin de destination"
              value={batchUnloadWarehouseId}
              onChange={setBatchUnloadWarehouseId}
              // Restreint aux magasins de l'agence d'arrivee : evite qu'un
              // operateur range les colis d'un conteneur dans un magasin
              // d'une autre agence par erreur de selection.
              search={(q, limit) =>
                searchers.warehouses(q, limit, {
                  agencyId: container.arrivalAgencyId || container.arrivalAgency?.id,
                })
              }
              placeholder={`Magasin de ${container.arrivalAgency?.name || "l'agence d'arrivee"}`}
              required
            />

            <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-3">
              <p className="mb-2 text-xs font-semibold text-primary-900">Par scan QR / code-barres</p>
              <LiveScanCollector
                onScan={handleLiveUnload}
                disabled={!batchUnloadWarehouseId}
                disabledReason="Selectionnez le magasin de destination avant de scanner."
                placeholder="Scanner ou coller un tracking..."
                helperText="Chaque scan decharge le colis immediatement. Re-scan du meme colis ignore pendant 2 minutes."
                cameraTitle="Scanner pour decharger"
              />
            </div>

            <div className="border-t border-gray-100 pt-3">
              <p className="mb-2 text-xs font-semibold text-gray-700">
                Ou selection manuelle (etiquette illisible)
              </p>
              <ParcelPickerList
                endpoint="/parcels"
                // Colis presents dans CE conteneur uniquement.
                baseFilters={{ containerId: id }}
                queryKey={['parcels', 'pickable-for-unload', id]}
                selectedIds={batchUnloadManualIds}
                onSelectedChange={setBatchUnloadManualIds}
                emptyText="Aucun colis charge dans ce conteneur."
                hideWarehouseColumn
              />
            </div>
          </div>
        </AppDialog>

        {/* Remove-from-container dialog (chargement par erreur) */}
        <AppDialog
          open={!!removeTarget}
          onClose={() => { setRemoveTarget(null); setRemoveReason(''); }}
          title={removeTarget ? `Retirer ${removeTarget.designation}` : 'Retirer du conteneur'}
          size="md"
          footer={
            <>
              <AppButton variant="ghost" onClick={() => { setRemoveTarget(null); setRemoveReason(''); }}>Annuler</AppButton>
              <AppButton onClick={handleRemoveConfirm} loading={removing}>
                <PackageMinus className="h-4 w-4" />
                Retirer
              </AppButton>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Le colis sera renvoye dans son magasin d&apos;origine et son retrait sera trace dans l&apos;historique.
              Le retrait n&apos;est autorise que pendant le chargement (statut LOADING).
            </p>
            <AppInput
              label="Raison du retrait"
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              placeholder="Ex : chargement par erreur, mauvais conteneur, ..."
              required
            />
          </div>
        </AppDialog>

        <ContainerFormDialog
          open={showEdit}
          onClose={() => setShowEdit(false)}
          container={container}
        />
        <ConfirmDialog
          open={!!missingTarget}
          onClose={() => setMissingTarget(null)}
          onConfirm={handleMarkMissingConfirm}
          title="Marquer le colis non recu"
          message={`Le colis ${missingTarget?.designation ?? ''} sera marque comme NON RECU physiquement (manquant). Il apparaitra dans le bordereau de comparaison comme present virtuellement mais absent physiquement, et passera au statut Perdu.`}
          confirmLabel="Marquer non recu"
          variant="destructive"
          loading={markingMissing}
        />
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
            // La liste des colis chargeables du conteneur est cachee sous
            // ['containers', id, 'loadable', ...] : invalider l'ancetre force
            // le refetch immediat, le nouveau colis apparait sans fermer le dialog.
            qc.invalidateQueries({ queryKey: ['containers', id, 'loadable'] });
            qc.invalidateQueries({ queryKey: ['parcels'] });
          }}
          defaultTransitType={container.isForwarding ? null : (container.type as 'AIR' | 'SEA' | 'LAND')}
        />

        <QRScannerDialog
          open={showCamera}
          onClose={() => setShowCamera(false)}
          onDetected={(decoded) => {
            setShowCamera(false);
            submitScan(decoded);
          }}
          title="Scanner pour charger un colis"
        />

        <ParcelQRDialog open={!!qrParcel} onClose={() => setQrParcel(null)} parcel={qrParcel} />
      </div>
    </PageTransition>
  );
}
