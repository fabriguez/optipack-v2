'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Upload, Package, Eye, RefreshCw, QrCode, HandCoins, Boxes, ChevronDown, Archive, ArchiveRestore } from 'lucide-react';
import { ParcelQRDialog } from '@/components/shared/ParcelQRDialog';
import { ParcelHandoverDialog } from '@/components/shared/ParcelHandoverDialog';
import { ParcelGroupFormDialog } from './ParcelGroupFormDialog';
import { AppDropdownMenu } from '@/components/ui/AppDropdownMenu';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { XlsxExportButton } from '@/components/shared/XlsxExportButton';
import { CsvImportDialog } from '@/components/shared/CsvImportDialog';
import { RowActions } from '@/components/shared/RowActions';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { useParcels, useArchiveParcels, useUnarchiveParcels } from '@/lib/hooks/useParcels';
import { AppCheckbox } from '@/components/ui/AppCheckbox';
import { AppBadge } from '@/components/ui/AppBadge';
import { cn } from '@/lib/utils/cn';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { toast } from 'sonner';
import { ParcelFormDialog } from './ParcelFormDialog';

function ParcelsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { page, search, setPage, setSearch, queryParams } = useServerPagination();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [qrParcel, setQrParcel] = useState<any | null>(null);
  const [handoverParcel, setHandoverParcel] = useState<any | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  // Onglet : actifs (par defaut) ou archives.
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  // Selection multi-lignes : Set d'IDs (compatible header "tout cocher").
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const statusFilter = searchParams.get('status') || '';
  const clientIdFilter = searchParams.get('clientId') || '';
  const warehouseIdFilter = searchParams.get('warehouseId') || '';

  const { data, isLoading } = useParcels({
    ...queryParams,
    status: statusFilter || undefined,
    clientId: clientIdFilter || undefined,
    warehouseId: warehouseIdFilter || undefined,
    archived: tab === 'archived' ? 'true' : undefined,
  } as any);

  const archiveMut = useArchiveParcels();
  const unarchiveMut = useUnarchiveParcels();
  const visibleRows: any[] = data?.data || [];
  const allChecked = visibleRows.length > 0 && visibleRows.every((r) => selectedIds.has(r.id));
  const someChecked = visibleRows.some((r) => selectedIds.has(r.id));

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        for (const r of visibleRows) next.delete(r.id);
      } else {
        for (const r of visibleRows) next.add(r.id);
      }
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const handleArchiveSelected = () => {
    if (selectedIds.size === 0) return;
    archiveMut.mutate(
      { ids: Array.from(selectedIds) },
      { onSuccess: () => clearSelection() },
    );
  };
  const handleUnarchiveSelected = () => {
    if (selectedIds.size === 0) return;
    unarchiveMut.mutate(
      { ids: Array.from(selectedIds) },
      { onSuccess: () => clearSelection() },
    );
  };

  // Quand on change d'onglet, on vide la selection (les IDs cibles sont
  // dans une autre liste). Effet via la fonction de change.
  const switchTab = (next: 'active' | 'archived') => {
    setTab(next);
    clearSelection();
    setPage(1);
  };

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
    { key: 'category', label: 'Type' },
    { key: 'client', label: 'Client' },
    { key: 'weight', label: 'Masse' },
    { key: 'volume', label: 'Volume (m3)' },
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
      key: '__select',
      // En-tete : un span avec onClick (le label de Column est string, donc on
      // affiche le check via le render, et on declenche toggleAllVisible au
      // clic du header via une astuce : un bouton dans le label HTML serait
      // ideal mais Column.label est string. On laisse vide ici et on rend la
      // checkbox de selection globale dans une row factice ? Plus simple :
      // on intercepte le clic sur la cellule de la 1ere ligne. Approche ici :
      // un bouton flottant dans la colonne via render).
      label: '',
      className: 'w-8',
      render: (row: any) => (
        <span
          onClick={(e) => {
            e.stopPropagation();
            toggleOne(row.id);
          }}
          className="inline-flex items-center"
        >
          <AppCheckbox checked={selectedIds.has(row.id)} onCheckedChange={() => toggleOne(row.id)} />
        </span>
      ),
    },
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
      key: 'category',
      label: 'Type',
      render: (row: any) => {
        const labels: Record<string, string> = {
          STANDARD: 'Standard',
          DOCUMENT: 'Document',
          FOOD: 'Alimentaire',
          ELECTRONICS: 'Electronique',
          CLOTHING: 'Vetement',
          OTHER: 'Autre',
        };
        return (
          <div className="flex flex-col gap-0.5">
            <AppBadge variant="default">{labels[row.category] || row.category || 'Standard'}</AppBadge>
            {(row.isFragile || row.isHazardous) && (
              <div className="flex gap-1">
                {row.isFragile && <AppBadge variant="warning">Fragile</AppBadge>}
                {row.isHazardous && <AppBadge variant="error">Dangereux</AppBadge>}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'weight',
      label: 'Masse / Volume',
      render: (row: any) => (
        <div className="flex flex-col text-sm">
          {row.weight != null && (
            <span className="font-medium text-gray-900">{Number(row.weight).toFixed(1)} kg</span>
          )}
          {row.volume != null && (
            <span className="text-xs text-gray-500">{Number(row.volume).toFixed(3)} m3</span>
          )}
          {row.weight == null && row.volume == null && (
            <span className="text-xs text-gray-300">-</span>
          )}
        </div>
      ),
    },
    {
      key: 'warehouse',
      label: 'Magasin',
      render: (row: any) =>
        row.warehouse ? (
          <Link
            href={`/warehouses/${row.warehouse.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-primary-700 hover:underline"
          >
            {row.warehouse.name}
            {row.warehouse.agency?.name && (
              <span className="block text-[10px] text-gray-400">{row.warehouse.agency.name}</span>
            )}
          </Link>
        ) : (
          <span className="text-xs text-gray-300">-</span>
        ),
    },
    {
      key: 'container',
      label: 'Conteneur',
      // Affiche le conteneur courant si charge (status LOADING/IN_TRANSIT...),
      // sinon le dernier conteneur de provenance pour comprendre d'ou vient
      // le colis quand il est en stock apres dechargement.
      render: (row: any) => {
        const c = row.container || row.lastContainer;
        if (!c) return <span className="text-xs text-gray-300">-</span>;
        const isCurrent = !!row.container;
        return (
          <Link
            href={`/containers/${c.id}`}
            onClick={(e) => e.stopPropagation()}
            className={`text-xs hover:underline ${isCurrent ? 'text-primary-700 font-medium' : 'text-gray-600'}`}
            title={isCurrent ? 'Conteneur actuel' : 'Conteneur de provenance'}
          >
            {c.designation}
            {!isCurrent && <span className="block text-[10px] text-gray-400">provenance</span>}
          </Link>
        );
      },
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
          { label: 'QR / Etiquette', icon: <QrCode className="h-4 w-4" />, onClick: () => setQrParcel(row) },
          ...(row.status !== 'DELIVERED'
            ? [{ label: 'Remettre au client', icon: <HandCoins className="h-4 w-4" />, onClick: () => setHandoverParcel(row) }]
            : []),
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
            <p className="text-sm text-gray-500 mt-1">
              {data?.meta?.total ?? 0} colis {tab === 'archived' ? 'archives' : 'actifs'}
            </p>
          </div>
          <div className="flex gap-2">
            <AppButton variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4" />
              Importer
            </AppButton>
            <AppDropdownMenu
              trigger={
                <AppButton>
                  <Plus className="h-4 w-4" />
                  Nouveau
                  <ChevronDown className="h-3.5 w-3.5" />
                </AppButton>
              }
              items={[
                { label: 'Un seul colis', icon: <Package className="h-4 w-4" />, onClick: () => setShowCreate(true) },
                { label: 'Un groupe de colis', icon: <Boxes className="h-4 w-4" />, onClick: () => setShowCreateGroup(true) },
              ]}
            />
          </div>
        </div>

        {/* Onglets : Actifs / Archives */}
        <nav className="flex flex-wrap gap-1 border-b border-gray-200">
          <button
            type="button"
            onClick={() => switchTab('active')}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === 'active'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-600 hover:text-gray-900',
            )}
          >
            En cours
          </button>
          <button
            type="button"
            onClick={() => switchTab('archived')}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === 'archived'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-600 hover:text-gray-900',
            )}
          >
            <Archive className="inline h-3.5 w-3.5 mr-1" />
            Archives
          </button>
        </nav>

        {/* Search --- Export | Filtres */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Tracking, designation, client..." />
          </div>
          <div className="flex items-center gap-2">
            <XlsxExportButton endpoint="parcels" fileName="colis" />
            <FilterDialog fields={filterFields} />
          </div>
        </div>

        {/* Barre d'actions bulk : selection + actions archive/desarchive sur visible. */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span
              onClick={toggleAllVisible}
              className="inline-flex items-center gap-1 cursor-pointer select-none"
            >
              <AppCheckbox checked={allChecked} onCheckedChange={toggleAllVisible} />
              <span>Tout cocher (page)</span>
            </span>
            {selectedIds.size > 0 && (
              <AppBadge variant="info">{selectedIds.size} selectionne(s)</AppBadge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                {tab === 'active' ? (
                  <AppButton size="sm" variant="outline" onClick={handleArchiveSelected} loading={archiveMut.isPending}>
                    <Archive className="h-3.5 w-3.5" />
                    Archiver
                  </AppButton>
                ) : (
                  <AppButton size="sm" onClick={handleUnarchiveSelected} loading={unarchiveMut.isPending}>
                    <ArchiveRestore className="h-3.5 w-3.5" />
                    Desarchiver
                  </AppButton>
                )}
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Annuler la selection
                </button>
              </>
            )}
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
        <ParcelGroupFormDialog open={showCreateGroup} onClose={() => setShowCreateGroup(false)} />
        <ParcelQRDialog open={!!qrParcel} onClose={() => setQrParcel(null)} parcel={qrParcel} />
        <ParcelHandoverDialog
          open={!!handoverParcel}
          onClose={() => setHandoverParcel(null)}
          parcel={handoverParcel}
        />
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
