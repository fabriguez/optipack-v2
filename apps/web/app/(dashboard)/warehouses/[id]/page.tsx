'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Package, Plus, Eye, Edit, Trash2, ArrowRightLeft, ClipboardCheck, PlayCircle, QrCode, HandCoins, MapPin, Camera, ScanLine, Boxes } from 'lucide-react';
import { BatchScanCollector } from '@/components/shared/BatchScanCollector';
import { ParcelPickerList } from '@/components/shared/ParcelPickerList';
import { normalizeScannedTracking } from '@/lib/utils/scanNormalize';
import { scanSound } from '@/lib/utils/scanSound';
import { ParcelQRDialog } from '@/components/shared/ParcelQRDialog';
import { ParcelHandoverDialog } from '@/components/shared/ParcelHandoverDialog';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppCheckbox } from '@/components/ui/AppCheckbox';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { RowActions } from '@/components/shared/RowActions';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParcels, useParcelFacets } from '@/lib/hooks/useParcels';
import { WarehouseParcelFilters, type ParcelFilterValues } from './WarehouseParcelFilters';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate, formatDurationSince } from '@transitsoftservices/shared';
import { toast } from 'sonner';
import { ParcelFormDialog } from '../../parcels/ParcelFormDialog';
import { WarehouseStorageRulesCard } from './WarehouseStorageRulesCard';
import { WarehouseFormDialog } from '../WarehouseFormDialog';
import { AgencyAvatar } from '@/components/shared/AgencyAvatar';
import { SpacesSection } from './SpacesSection';
import { MoveToSpaceDialog } from './MoveToSpaceDialog';

export default function WarehouseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const [parcelPage, setParcelPage] = useState(1);
  // Filtres du listing colis, scopes aux valeurs presentes dans ce magasin.
  const [parcelFilters, setParcelFilters] = useState<ParcelFilterValues>({});
  const setParcelFilter = (key: keyof ParcelFilterValues, value?: string) => {
    setParcelFilters((f) => ({ ...f, [key]: value }));
    setParcelPage(1);
  };
  const [parcelView, setParcelView] = useState<'parcels' | 'groups'>('parcels');
  const [showCreateParcel, setShowCreateParcel] = useState(false);
  const [editParcel, setEditParcel] = useState<any>(null);
  const [deleteParcel, setDeleteParcel] = useState<any>(null);
  const [lostParcel, setLostParcel] = useState<any>(null);
  const [transferParcel, setTransferParcel] = useState<any>(null);
  const [removeParcel, setRemoveParcel] = useState<any>(null);
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [qrParcel, setQrParcel] = useState<any | null>(null);
  const [handoverParcel, setHandoverParcel] = useState<any | null>(null);
  const [showUntrackedHandover, setShowUntrackedHandover] = useState(false);
  const [moveSpaceParcel, setMoveSpaceParcel] = useState<any | null>(null);
  const [editWarehouseOpen, setEditWarehouseOpen] = useState(false);
  // Batch scan : ajout / retrait de colis existants par scan QR.
  const [batchAddOpen, setBatchAddOpen] = useState(false);
  const [batchAddCodes, setBatchAddCodes] = useState<string[]>([]);
  const [batchAddBusy, setBatchAddBusy] = useState(false);
  // IDs selectionnes manuellement via la liste paginee (cas etiquettes defectueuses).
  const [batchAddManualIds, setBatchAddManualIds] = useState<string[]>([]);
  const [batchRemoveOpen, setBatchRemoveOpen] = useState(false);
  const [batchRemoveCodes, setBatchRemoveCodes] = useState<string[]>([]);
  const [batchRemoveBusy, setBatchRemoveBusy] = useState(false);
  const [batchRemoveManualIds, setBatchRemoveManualIds] = useState<string[]>([]);
  // Transfert multiple : on scanne plusieurs colis et on les bascule tous
  // vers le meme magasin destination. Suivi du meme pattern que add/remove
  // mais avec une 2eme dimension (warehouse target).
  const [batchTransferOpen, setBatchTransferOpen] = useState(false);
  const [batchTransferCodes, setBatchTransferCodes] = useState<string[]>([]);
  const [batchTransferTarget, setBatchTransferTarget] = useState<string | null>(null);
  const [batchTransferBusy, setBatchTransferBusy] = useState(false);
  // IDs des colis SELECTIONNES dans la liste du magasin (multi-select via
  // checkboxes). Pre-rempli la modale de transfert quand on l'ouvre depuis
  // le bouton "Transferer la selection".
  const [selectedParcelIds, setSelectedParcelIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['warehouses', id],
    queryFn: () => apiClient.get(`/warehouses/${id}`).then((r) => r.data),
    enabled: !!id,
  });
  const warehouseAgencyId: string | undefined = data?.data?.agency?.id;

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
    ...parcelFilters,
  } as any);

  // Valeurs distinctes pour les selects de filtre (conteneur, client, zone,
  // destination, statut) presentes dans ce magasin uniquement.
  const { data: facetsData } = useParcelFacets(
    { warehouseId: id, onlyPresent: true },
    !!id && parcelView === 'parcels',
  );

  // Groupes de colis de l'agence du magasin (un groupe n'a pas de magasin
  // propre : il est scope a l'agence). Charge uniquement en vue "groupes".
  const { data: groupsData, isLoading: groupsLoading } = useQuery({
    queryKey: ['parcel-groups', 'warehouse', id],
    queryFn: () =>
      apiClient
        .get('/parcel-groups', { params: { agencyId: warehouseAgencyId || undefined } })
        .then((r) => r.data),
    enabled: parcelView === 'groups' && !!warehouseAgencyId,
  });

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

  const warehouse = data?.data;

  // Load warehouses for transfer dialog (single + batch). On scope sur la
  // MEME agence que le magasin courant : un transfert inter-agence aurait
  // un autre semantique (handover via conteneur), pas un simple
  // changement de warehouseId. Le filtre se fait cote API via
  // `agencyId` qui retourne uniquement les magasins de cette agence.
  const currentAgencyId = warehouse?.agency?.id || warehouse?.agencyId;
  const { data: allWarehousesData } = useQuery({
    queryKey: ['warehouses-for-transfer', currentAgencyId],
    queryFn: () =>
      apiClient
        .get('/warehouses', { params: { limit: 200, agencyId: currentAgencyId } })
        .then((r) => r.data),
    enabled: (!!transferParcel || batchTransferOpen) && !!currentAgencyId,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (!warehouse) return <p className="p-6 text-gray-500">Magasin introuvable</p>;

  const warehouseOptions = (allWarehousesData?.data || [])
    .filter((w: any) => w.id !== id)
    .map((w: any) => ({
      value: w.id,
      label: w.name,
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

  // Resout un tracking number en parcel id (en n'acceptant que les colis
  // existants). On va chercher dans la base via l'endpoint de recherche
  // generique. Echoue clairement si introuvable.
  const findParcelByTracking = async (rawTracking: string) => {
    // BUG FIX : les QR encodent une URL ("https://.../tracking/TST-X"), pas
    // le tracking nu. Normalisation systematique avant la recherche.
    const tracking = normalizeScannedTracking(rawTracking);
    const r = await apiClient.get('/parcels', { params: { search: tracking, limit: 5 } });
    const list = (r.data?.data || []) as any[];
    const match = list.find((p) => p.trackingNumber === tracking) || list[0];
    if (!match) throw new Error(`Colis introuvable : ${tracking}`);
    return match;
  };

  const handleBatchAdd = async (codes: string[]) => {
    setBatchAddBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const code of codes) {
      try {
        const p = await findParcelByTracking(code);
        await apiClient.patch(`/parcels/${p.id}/status`, {
          status: 'IN_STOCK',
          warehouseId: id,
        });
        ok++;
      } catch (e: any) {
        failed.push(`${code}: ${e?.response?.data?.message || e?.message || 'echec'}`);
      }
    }
    setBatchAddBusy(false);
    setBatchAddCodes(failed.length === 0 ? [] : codes.filter((c) => failed.some((f) => f.startsWith(`${c}:`))));
    if (ok > 0 && failed.length === 0) scanSound.success();
    else if (failed.length > 0) scanSound.error();
    if (ok > 0) toast.success(`${ok} colis ajoute${ok > 1 ? 's' : ''} au magasin`);
    if (failed.length > 0) toast.error(`${failed.length} echec(s) : ${failed[0]}`);
    invalidateAll();
    if (failed.length === 0) setBatchAddOpen(false);
  };

  // Variantes "by IDs" : utilisees quand l'operateur selectionne dans la liste
  // paginee (etiquettes defectueuses) plutot que de scanner.
  const handleBatchAddByIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBatchAddBusy(true);
    let ok = 0;
    const failed: { id: string; reason: string }[] = [];
    for (const pid of ids) {
      try {
        await apiClient.patch(`/parcels/${pid}/status`, {
          status: 'IN_STOCK',
          warehouseId: id,
        });
        ok++;
      } catch (e: any) {
        failed.push({ id: pid, reason: e?.response?.data?.message || 'echec' });
      }
    }
    setBatchAddBusy(false);
    if (ok > 0) toast.success(`${ok} colis ajoute${ok > 1 ? 's' : ''} au magasin`);
    if (failed.length > 0) toast.error(`${failed.length} echec(s) : ${failed[0].reason}`);
    invalidateAll();
    if (failed.length === 0) {
      setBatchAddOpen(false);
      setBatchAddManualIds([]);
    } else {
      // Garde uniquement les echecs en selection pour relance / debug.
      setBatchAddManualIds(failed.map((f) => f.id));
    }
  };

  // Transfert d'un set d'IDs (pas de scan). Utilise quand on est passe par
  // la selection multiple dans la liste. Le magasin destination doit etre
  // de la meme agence (verifie cote backend aussi).
  const handleBatchTransferByIds = async (ids: string[]) => {
    if (!batchTransferTarget) {
      toast.error('Selectionnez un magasin destination.');
      return;
    }
    if (ids.length === 0) return;
    setBatchTransferBusy(true);
    let ok = 0;
    const failed: { id: string; reason: string }[] = [];
    for (const pid of ids) {
      try {
        await apiClient.patch(`/parcels/${pid}/status`, {
          status: 'IN_STOCK',
          warehouseId: batchTransferTarget,
        });
        ok++;
      } catch (e: any) {
        failed.push({ id: pid, reason: e?.response?.data?.message || 'echec' });
      }
    }
    setBatchTransferBusy(false);
    if (ok > 0 && failed.length === 0) scanSound.success();
    else if (failed.length > 0) scanSound.error();
    if (ok > 0) toast.success(`${ok} colis transfere${ok > 1 ? 's' : ''}`);
    if (failed.length > 0) toast.error(`${failed.length} echec(s) : ${failed[0].reason}`);
    invalidateAll();
    if (failed.length === 0) {
      setBatchTransferOpen(false);
      setBatchTransferTarget(null);
      setSelectedParcelIds(new Set());
    }
  };

  const handleBatchTransfer = async (codes: string[]) => {
    if (!batchTransferTarget) {
      toast.error('Selectionnez un magasin destination.');
      return;
    }
    setBatchTransferBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const code of codes) {
      try {
        const p = await findParcelByTracking(code);
        await apiClient.patch(`/parcels/${p.id}/status`, {
          status: 'IN_STOCK',
          warehouseId: batchTransferTarget,
        });
        ok++;
      } catch (e: any) {
        failed.push(`${code}: ${e?.response?.data?.message || e?.message || 'echec'}`);
      }
    }
    setBatchTransferBusy(false);
    setBatchTransferCodes(
      failed.length === 0 ? [] : codes.filter((c) => failed.some((f) => f.startsWith(`${c}:`))),
    );
    if (ok > 0 && failed.length === 0) scanSound.success();
    else if (failed.length > 0) scanSound.error();
    if (ok > 0) toast.success(`${ok} colis transfere${ok > 1 ? 's' : ''}`);
    if (failed.length > 0) toast.error(`${failed.length} echec(s) : ${failed[0]}`);
    invalidateAll();
    if (failed.length === 0) {
      setBatchTransferOpen(false);
      setBatchTransferTarget(null);
    }
  };

  const handleBatchRemoveByIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBatchRemoveBusy(true);
    let ok = 0;
    const failed: { id: string; reason: string }[] = [];
    for (const pid of ids) {
      try {
        await apiClient.patch(`/parcels/${pid}/status`, {
          status: 'IN_STOCK',
          warehouseId: null,
        });
        ok++;
      } catch (e: any) {
        failed.push({ id: pid, reason: e?.response?.data?.message || 'echec' });
      }
    }
    setBatchRemoveBusy(false);
    if (ok > 0) toast.success(`${ok} colis retire${ok > 1 ? 's' : ''} du magasin`);
    if (failed.length > 0) toast.error(`${failed.length} echec(s) : ${failed[0].reason}`);
    invalidateAll();
    if (failed.length === 0) {
      setBatchRemoveOpen(false);
      setBatchRemoveManualIds([]);
    } else {
      setBatchRemoveManualIds(failed.map((f) => f.id));
    }
  };

  const handleBatchRemove = async (codes: string[]) => {
    setBatchRemoveBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const code of codes) {
      try {
        const p = await findParcelByTracking(code);
        // Exige que le colis soit dans CE magasin pour eviter les retraits
        // accidentels d'un colis d'un autre magasin scanne par erreur.
        if (p.warehouseId !== id) {
          failed.push(`${code}: pas dans ce magasin`);
          continue;
        }
        await apiClient.patch(`/parcels/${p.id}/status`, {
          status: 'IN_STOCK',
          warehouseId: null,
        });
        ok++;
      } catch (e: any) {
        failed.push(`${code}: ${e?.response?.data?.message || e?.message || 'echec'}`);
      }
    }
    setBatchRemoveBusy(false);
    setBatchRemoveCodes(failed.length === 0 ? [] : codes.filter((c) => failed.some((f) => f.startsWith(`${c}:`))));
    if (ok > 0 && failed.length === 0) scanSound.success();
    else if (failed.length > 0) scanSound.error();
    if (ok > 0) toast.success(`${ok} colis retire${ok > 1 ? 's' : ''} du magasin`);
    if (failed.length > 0) toast.error(`${failed.length} echec(s) : ${failed[0]}`);
    invalidateAll();
    if (failed.length === 0) setBatchRemoveOpen(false);
  };

  const handleDeleteParcel = async () => {
    if (!deleteParcel) return;
    try {
      await apiClient.delete(`/parcels/${deleteParcel.id}`);
      toast.success(`Colis ${deleteParcel.trackingNumber} supprime`);
      invalidateAll();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur lors de la suppression');
    }
    setDeleteParcel(null);
  };

  const handleMarkLost = async () => {
    if (!lostParcel) return;
    try {
      await apiClient.patch(`/parcels/${lostParcel.id}/status`, { status: 'LOST' });
      toast.success(`Colis ${lostParcel.trackingNumber} marque comme perdu`);
      invalidateAll();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur lors du marquage');
    }
    setLostParcel(null);
  };

  const canModifyParcel = (row: any) => row.status === 'IN_STOCK';

  // Selection multi-colis dans la liste (pour transfert en lot vers un
  // autre magasin de la meme agence). Seuls les colis "modifiables"
  // (IN_STOCK) sont eligibles. Les lignes non eligibles ne montrent pas
  // de checkbox.
  const visibleParcels: any[] = parcelsData?.data || [];
  const selectableParcels = visibleParcels.filter(canModifyParcel);
  const allVisibleSelected =
    selectableParcels.length > 0 && selectableParcels.every((r) => selectedParcelIds.has(r.id));
  const toggleAllVisible = () => {
    setSelectedParcelIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const r of selectableParcels) next.delete(r.id);
      } else {
        for (const r of selectableParcels) next.add(r.id);
      }
      return next;
    });
  };
  const toggleOneParcel = (id: string) => {
    setSelectedParcelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const parcelColumns = [
    {
      key: '__select',
      label: '',
      className: 'w-8',
      render: (row: any) =>
        canModifyParcel(row) ? (
          <span onClick={(e) => e.stopPropagation()} className="inline-flex">
            <AppCheckbox
              checked={selectedParcelIds.has(row.id)}
              onCheckedChange={() => toggleOneParcel(row.id)}
            />
          </span>
        ) : (
          <span className="text-[10px] text-gray-300">-</span>
        ),
    },
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
    {
      key: 'firstContainer',
      label: 'Conteneur de livraison',
      // Affichage : 1er conteneur traverse par le colis (histories[0].container).
      // Fallback sur lastContainer si aucun historique conteneur. La logique
      // metier (lastContainer pour provenance/dechargement) reste inchangee.
      render: (row: any) => {
        const c = row.histories?.[0]?.container ?? row.lastContainer ?? null;
        return c ? (
          <Link
            href={`/containers/${c.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-primary-700 hover:underline"
          >
            {c.designation}
          </Link>
        ) : (
          <span className="text-xs text-gray-300">-</span>
        );
      },
    },
    { key: 'price', label: 'Prix', render: (row: any) => formatAmount(Number(row.price)) },
    { key: 'status', label: 'Statut', render: (row: any) => <StatusBadge status={row.status} type="parcel" /> },
    {
      key: 'space',
      label: 'Zone',
      render: (row: any) =>
        row.space?.name ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-1.5 py-0.5 text-[11px] font-medium text-primary-700">
            <MapPin className="h-3 w-3" />
            {row.space.name}
          </span>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        ),
    },
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
            { label: 'QR / Etiquette', icon: <QrCode className="h-4 w-4" />, onClick: () => setQrParcel(row) },
            ...(row.status !== 'DELIVERED'
              ? [{ label: 'Remettre au client', icon: <HandCoins className="h-4 w-4" />, onClick: () => setHandoverParcel(row) }]
              : []),
            ...(canModifyParcel(row) ? [
              { label: 'Modifier', icon: <Edit className="h-4 w-4" />, onClick: () => router.push(`/parcels/${row.id}`) },
              { label: 'Deplacer vers une zone', icon: <MapPin className="h-4 w-4" />, onClick: () => setMoveSpaceParcel(row) },
              { label: 'Transferer', icon: <ArrowRightLeft className="h-4 w-4" />, onClick: () => setTransferParcel(row) },
              { label: 'Retirer du magasin', icon: <Package className="h-4 w-4" />, onClick: () => setRemoveParcel(row) },
              { label: 'Marquer perdu', icon: <AlertTriangle className="h-4 w-4" />, onClick: () => setLostParcel(row) },
              { label: 'Supprimer', icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleteParcel(row), variant: 'destructive' as const },
            ] : []),
          ]}
        />
      ),
    },
  ];

  const groupColumns = [
    {
      key: 'reference',
      label: 'Reference',
      render: (row: any) => <span className="font-mono text-xs font-bold text-primary-700">{row.reference}</span>,
    },
    { key: 'label', label: 'Libelle', render: (row: any) => row.label || '-' },
    { key: 'client', label: 'Client', render: (row: any) => row.client?.fullName || '-' },
    {
      key: 'parcels',
      label: 'Colis',
      render: (row: any) => <AppBadge variant="info">{row._count?.parcels ?? 0}</AppBadge>,
    },
    {
      key: 'invoice',
      label: 'Facture groupe',
      render: (row: any) =>
        row.invoice ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{formatAmount(Number(row.invoice.totalAmount))}</span>
            <StatusBadge status={row.invoice.status} type="invoice" />
          </div>
        ) : (
          <span className="text-xs text-gray-300">-</span>
        ),
    },
    { key: 'status', label: 'Statut', render: (row: any) => <AppBadge variant="default">{row.status}</AppBadge> },
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
          <div className="flex-1">
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
          <AppButton variant="outline" size="sm" onClick={() => setEditWarehouseOpen(true)}>
            <Edit className="h-3.5 w-3.5" />
            Modifier
          </AppButton>
        </div>

        <WarehouseStorageRulesCard warehouseId={warehouse.id} />

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

              <SpacesSection warehouseId={id} />

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
          <div className="mb-4 flex w-fit gap-1 rounded-lg bg-gray-100 p-1">
            {([
              { value: 'parcels', label: 'Colis', icon: <Package className="h-3.5 w-3.5" /> },
              { value: 'groups', label: 'Groupes de colis', icon: <Boxes className="h-3.5 w-3.5" /> },
            ] as const).map((v) => (
              <button
                key={v.value}
                onClick={() => setParcelView(v.value)}
                className={
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (parcelView === v.value ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-900')
                }
              >
                {v.icon}
                {v.label}
              </button>
            ))}
          </div>

          {parcelView === 'groups' ? (
            <AppDataTable
              columns={groupColumns}
              data={groupsData?.data || []}
              isLoading={groupsLoading}
              onRowClick={(row) => router.push(`/parcel-groups/${row.id}`)}
            />
          ) : (
          <>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Colis dans ce magasin ({parcelsData?.meta?.total ?? 0})</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/parcels?warehouseId=${id}`}>
                <AppButton variant="ghost" size="sm">Voir tout</AppButton>
              </Link>
              <AppButton variant="outline" size="sm" onClick={() => setShowUntrackedHandover(true)}>
                <HandCoins className="h-3.5 w-3.5" />
                Remettre un colis non enregistre
              </AppButton>
              <AppButton variant="outline" size="sm" onClick={() => setBatchAddOpen(true)}>
                <Camera className="h-3.5 w-3.5" />
                Ajouter par scan
              </AppButton>
              <AppButton variant="outline" size="sm" onClick={() => setBatchRemoveOpen(true)}>
                <ScanLine className="h-3.5 w-3.5" />
                Retirer par scan
              </AppButton>
              <AppButton variant="outline" size="sm" onClick={() => setBatchTransferOpen(true)}>
                <Camera className="h-3.5 w-3.5" />
                Transferer par scan
              </AppButton>
              <AppButton size="sm" onClick={() => setShowCreateParcel(true)}>
                <Plus className="h-3.5 w-3.5" />
                Ajouter colis
              </AppButton>
            </div>
          </div>
          <WarehouseParcelFilters
            facets={facetsData?.data}
            values={parcelFilters}
            onChange={setParcelFilter}
            onReset={() => {
              setParcelFilters({});
              setParcelPage(1);
            }}
          />
          {/* Barre de selection : visible des qu'il y a au moins une ligne
              eligible (IN_STOCK). Permet "tout cocher (page)", affiche le
              compteur, et expose le bouton "Transferer la selection" qui
              ouvre la modale batch transfert pre-remplie. */}
          {selectableParcels.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span
                  onClick={toggleAllVisible}
                  className="inline-flex cursor-pointer select-none items-center gap-1"
                >
                  <AppCheckbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} />
                  <span>Tout cocher (page)</span>
                </span>
                {selectedParcelIds.size > 0 && (
                  <AppBadge variant="info">{selectedParcelIds.size} selectionne(s)</AppBadge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedParcelIds.size > 0 && (
                  <>
                    <AppButton
                      size="sm"
                      onClick={() => {
                        // Ouvre la modale en mode "selection" (pas de scan).
                        // batchTransferCodes reste vide, on passe directement
                        // les IDs au handler `handleBatchTransferByIds`.
                        setBatchTransferOpen(true);
                      }}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      Transferer {selectedParcelIds.size} colis
                    </AppButton>
                    <button
                      type="button"
                      onClick={() => setSelectedParcelIds(new Set())}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      Annuler la selection
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
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
          </>
          )}
        </AppCard>
      </div>

      <ParcelQRDialog open={!!qrParcel} onClose={() => setQrParcel(null)} parcel={qrParcel} />
      <ParcelHandoverDialog
        open={!!handoverParcel}
        onClose={() => setHandoverParcel(null)}
        parcel={handoverParcel}
      />
      <ParcelHandoverDialog
        open={showUntrackedHandover}
        onClose={() => setShowUntrackedHandover(false)}
        untracked={
          warehouse?.agency
            ? { agencyId: warehouse.agency.id, warehouseId: id }
            : null
        }
      />

      <WarehouseFormDialog
        open={editWarehouseOpen}
        onClose={() => setEditWarehouseOpen(false)}
        warehouse={warehouse}
      />

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
            Transferer le colis <span className="font-bold font-mono">{transferParcel?.trackingNumber}</span> ({transferParcel?.designation}) vers un autre magasin de l&apos;agence{' '}
            <span className="font-semibold">{warehouse.agency?.name || 'courante'}</span>.
          </p>
          <AppSelect
            label="Magasin de destination"
            options={warehouseOptions}
            value={targetWarehouseId}
            onValueChange={setTargetWarehouseId}
            placeholder={
              warehouseOptions.length === 0
                ? 'Aucun autre magasin dans cette agence'
                : 'Selectionner un magasin'
            }
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

      {/* Move to space */}
      <MoveToSpaceDialog
        open={!!moveSpaceParcel}
        onClose={() => setMoveSpaceParcel(null)}
        warehouseId={id}
        parcel={moveSpaceParcel}
      />

      {/* Batch ajouter : scan + selection manuelle dans la liste paginee. */}
      <AppDialog
        open={batchAddOpen}
        onClose={() => {
          setBatchAddOpen(false);
          setBatchAddCodes([]);
          setBatchAddManualIds([]);
        }}
        title="Ajouter des colis"
        size="xl"
        footer={
          batchAddManualIds.length > 0 ? (
            <>
              <AppButton variant="ghost" onClick={() => setBatchAddManualIds([])}>
                Vider la selection
              </AppButton>
              <AppButton
                onClick={() => handleBatchAddByIds(batchAddManualIds)}
                loading={batchAddBusy}
              >
                <Package className="h-4 w-4" />
                Ajouter {batchAddManualIds.length} colis selectionnes
              </AppButton>
            </>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Transferez les colis existants vers <span className="font-semibold">{warehouse.name}</span>.
            Scan QR pour aller vite, ou selection manuelle dans la liste si l&apos;etiquette est defectueuse.
          </p>

          <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-3">
            <p className="mb-2 text-xs font-semibold text-primary-900">Par scan QR / code-barres</p>
            <BatchScanCollector
              codes={batchAddCodes}
              onChange={setBatchAddCodes}
              submitLabel={`Transferer ${batchAddCodes.length || ''} colis ici`}
              onSubmit={handleBatchAdd}
              submitting={batchAddBusy}
              placeholder="Scanner ou coller un tracking existant..."
              cameraTitle="Scanner pour ajouter"
            />
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="mb-2 text-xs font-semibold text-gray-700">
              Ou selection manuelle (etiquette illisible)
            </p>
            <ParcelPickerList
              endpoint="/parcels"
              // Tous les colis IN_STOCK sauf ceux deja dans ce magasin.
              baseFilters={{ status: 'IN_STOCK', onlyPresent: 'true' }}
              queryKey={['parcels', 'pickable-for-warehouse-add', id]}
              selectedIds={batchAddManualIds}
              onSelectedChange={setBatchAddManualIds}
              emptyText="Aucun colis disponible."
            />
          </div>
        </div>
      </AppDialog>

      {/* Batch retirer : scan + selection manuelle dans la liste paginee. */}
      <AppDialog
        open={batchRemoveOpen}
        onClose={() => {
          setBatchRemoveOpen(false);
          setBatchRemoveCodes([]);
          setBatchRemoveManualIds([]);
        }}
        title="Retirer des colis"
        size="xl"
        footer={
          batchRemoveManualIds.length > 0 ? (
            <>
              <AppButton variant="ghost" onClick={() => setBatchRemoveManualIds([])}>
                Vider la selection
              </AppButton>
              <AppButton
                onClick={() => handleBatchRemoveByIds(batchRemoveManualIds)}
                loading={batchRemoveBusy}
                variant="outline"
              >
                <Package className="h-4 w-4" />
                Retirer {batchRemoveManualIds.length} colis selectionnes
              </AppButton>
            </>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Retirez des colis presents dans <span className="font-semibold">{warehouse.name}</span>.
            Scan QR ou selection manuelle dans la liste.
          </p>

          <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3">
            <p className="mb-2 text-xs font-semibold text-amber-900">Par scan QR / code-barres</p>
            <BatchScanCollector
              codes={batchRemoveCodes}
              onChange={setBatchRemoveCodes}
              submitLabel={`Retirer ${batchRemoveCodes.length || ''} colis`}
              onSubmit={handleBatchRemove}
              submitting={batchRemoveBusy}
              placeholder="Scanner ou coller un tracking..."
              cameraTitle="Scanner pour retirer"
            />
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="mb-2 text-xs font-semibold text-gray-700">
              Ou selection manuelle (etiquette illisible)
            </p>
            <ParcelPickerList
              endpoint="/parcels"
              // Colis presents dans CE magasin uniquement.
              baseFilters={{ warehouseId: id, onlyPresent: 'true' }}
              queryKey={['parcels', 'pickable-for-warehouse-remove', id]}
              selectedIds={batchRemoveManualIds}
              onSelectedChange={setBatchRemoveManualIds}
              emptyText="Aucun colis present dans ce magasin."
              hideWarehouseColumn
            />
          </div>
        </div>
      </AppDialog>

      {/* Transferer par scan : scan multiple + magasin destination commun.
          Pas de selection manuelle ici (la liste est deja accessible via
          add/remove). Reutilise BatchScanCollector pour la liste live. */}
      <AppDialog
        open={batchTransferOpen}
        onClose={() => {
          setBatchTransferOpen(false);
          setBatchTransferCodes([]);
          setBatchTransferTarget(null);
        }}
        title="Transferer des colis vers un autre magasin"
        size="xl"
        footer={
          selectedParcelIds.size > 0 ? (
            <>
              <AppButton variant="ghost" onClick={() => setBatchTransferOpen(false)}>
                Annuler
              </AppButton>
              <AppButton
                onClick={() => handleBatchTransferByIds(Array.from(selectedParcelIds))}
                loading={batchTransferBusy}
                disabled={!batchTransferTarget}
              >
                <ArrowRightLeft className="h-4 w-4" />
                Transferer {selectedParcelIds.size} colis selectionnes
              </AppButton>
            </>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            {selectedParcelIds.size > 0
              ? `${selectedParcelIds.size} colis selectionne(s) depuis la liste. Ils seront tous deplaces vers le magasin choisi.`
              : `Scannez les colis a transferer depuis ${warehouse.name}. Tous seront deplaces vers le magasin choisi ci-dessous.`}
          </p>
          <p className="text-xs text-amber-700">
            Les magasins proposes sont limites a la meme agence (
            <span className="font-semibold">{warehouse.agency?.name || 'agence courante'}</span>
            ). Pour un transfert inter-agence, utilisez un conteneur.
          </p>
          {/* Highlight rouge si tentative de soumission sans destination. */}
          <div
            className={
              !batchTransferTarget && (batchTransferCodes.length > 0 || selectedParcelIds.size > 0)
                ? 'rounded-xl ring-2 ring-red-300 ring-offset-2 animate-pulse'
                : ''
            }
          >
            <AppSelect
              label="Magasin destination"
              value={batchTransferTarget ?? ''}
              onValueChange={(v) => setBatchTransferTarget(v || null)}
              options={warehouseOptions}
              placeholder={
                warehouseOptions.length === 0
                  ? 'Aucun autre magasin dans cette agence'
                  : 'Selectionner le magasin destination'
              }
            />
            {!batchTransferTarget && (batchTransferCodes.length > 0 || selectedParcelIds.size > 0) && (
              <p className="mt-1 text-xs font-medium text-red-600">
                Selectionnez un magasin destination avant de valider le transfert.
              </p>
            )}
          </div>

          {/* Mode SELECTION : on affiche un resume des colis pre-coches.
              Pas de scan dans ce mode -- la liste est figee. */}
          {selectedParcelIds.size > 0 ? (
            <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-3">
              <p className="mb-2 text-xs font-semibold text-primary-900">
                Colis selectionnes ({selectedParcelIds.size})
              </p>
              <ul className="max-h-44 space-y-1 overflow-auto text-xs">
                {Array.from(selectedParcelIds).map((pid) => {
                  const p = visibleParcels.find((x) => x.id === pid);
                  return (
                    <li key={pid} className="flex items-center justify-between">
                      <span className="font-mono text-gray-700">
                        {p?.trackingNumber || pid.slice(0, 8)}
                      </span>
                      <span className="text-gray-500">{p?.designation || ''}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            // Mode SCAN classique.
            <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-3">
              <p className="mb-2 text-xs font-semibold text-primary-900">Par scan QR / code-barres</p>
              <BatchScanCollector
                codes={batchTransferCodes}
                onChange={setBatchTransferCodes}
                submitLabel={`Transferer ${batchTransferCodes.length || ''} colis`}
                onSubmit={handleBatchTransfer}
                submitting={batchTransferBusy}
                placeholder="Scanner ou coller un tracking..."
                cameraTitle="Scanner pour transferer"
              />
            </div>
          )}
        </div>
      </AppDialog>

      {/* Delete confirm (soft delete = retire de la liste) */}
      <ConfirmDialog
        open={!!deleteParcel}
        onClose={() => setDeleteParcel(null)}
        onConfirm={handleDeleteParcel}
        title="Supprimer le colis"
        message={`Le colis ${deleteParcel?.trackingNumber} (${deleteParcel?.designation}) sera supprime de la liste. Cette action est irreversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
      />

      {/* Marquer perdu */}
      <ConfirmDialog
        open={!!lostParcel}
        onClose={() => setLostParcel(null)}
        onConfirm={handleMarkLost}
        title="Marquer le colis comme perdu"
        message={`Le colis ${lostParcel?.trackingNumber} (${lostParcel?.designation}) sera marque comme perdu (statut LOST). Cette action est irreversible.`}
        confirmLabel="Marquer perdu"
        variant="destructive"
      />
    </PageTransition>
  );
}
