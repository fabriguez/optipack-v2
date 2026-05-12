'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Receipt, Eye, Ban } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppBadge } from '@/components/ui/AppBadge';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { RowActions } from '@/components/shared/RowActions';
import { useQuery } from '@tanstack/react-query';
import { disbursementsApi } from '@/lib/api/finance';
import { searchers } from '@/lib/api/searchers';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';
import { DisbursementFormDialog } from './DisbursementFormDialog';

export default function DisbursementsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const agencyFilter = searchParams.get('agencyId') || '';
  const ordererUserId = searchParams.get('ordererUserId') || '';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';
  const containerId = searchParams.get('containerId') || '';
  const parcelId = searchParams.get('parcelId') || '';
  const clientId = searchParams.get('clientId') || '';

  const { data, isLoading } = useQuery({
    queryKey: ['disbursements', { page, search, agencyFilter, ordererUserId, dateFrom, dateTo, containerId, parcelId, clientId }],
    queryFn: () => disbursementsApi.list({
      page,
      limit: 20,
      search: search || undefined,
      agencyId: agencyFilter || undefined,
      ordererUserId: ordererUserId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      containerId: containerId || undefined,
      parcelId: parcelId || undefined,
      clientId: clientId || undefined,
    } as any),
  });

  // Searcher specifique pour filtrer par ordonnateur habilite.
  const ordererSearcher = (q: string, limit?: number) => searchers.employeesByPermission(q, limit, { key: 'disbursement.order' });

  const exportColumns = [
    { key: 'reference', label: 'Reference' },
    { key: 'reason', label: 'Motif' },
    { key: 'orderer', label: 'Ordonnateur' },
    { key: 'amount', label: 'Montant' },
    { key: 'createdAt', label: 'Date' },
  ];

  const filterFields = [
    { key: 'agencyId', label: 'Agence', type: 'search-select' as const, searcher: searchers.agencies },
    { key: 'ordererUserId', label: 'Ordonnateur', type: 'search-select' as const, searcher: ordererSearcher },
    { key: 'dateFrom', label: 'Date debut', type: 'date' as const },
    { key: 'dateTo', label: 'Date fin', type: 'date' as const },
    { key: 'containerId', label: 'Conteneur', type: 'search-select' as const, searcher: searchers.containers },
    { key: 'parcelId', label: 'Colis', type: 'search-select' as const, searcher: searchers.parcels },
    { key: 'clientId', label: 'Client', type: 'search-select' as const, searcher: searchers.clients },
  ];

  const columns = [
    { key: 'reference', label: 'Reference', render: (row: any) => <Link href={`/disbursements/${row.id}`} className="font-mono text-xs text-primary-700 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{row.reference}</Link> },
    { key: 'reason', label: 'Motif' },
    { key: 'orderer', label: 'Ordonnateur', render: (row: any) => row.ordererUser ? (
      <Link href={`/employees/${row.ordererUser.id}`} className="text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>{row.orderer}</Link>
    ) : row.orderer },
    { key: 'agency', label: 'Agence', render: (row: any) => row.agency?.name || '-' },
    { key: 'imputation', label: 'Imputation', render: (row: any) => {
      const items: React.ReactNode[] = [];
      if (row.container) items.push(<Link key="c" href={`/containers/${row.container.id}`} className="text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>{row.container.designation}</Link>);
      if (row.parcel) items.push(<Link key="p" href={`/parcels/${row.parcel.id}`} className="text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>{row.parcel.trackingNumber}</Link>);
      if (row.client) items.push(<Link key="cl" href={`/clients/${row.client.id}`} className="text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>{row.client.fullName}</Link>);
      if (!items.length) return <span className="text-gray-400 text-xs">-</span>;
      return <div className="flex flex-col gap-0.5 text-xs">{items}</div>;
    } },
    { key: 'amount', label: 'Montant', render: (row: any) => <span className="font-semibold text-red-600">{formatAmount(Number(row.amount))}</span> },
    { key: 'isVoided', label: 'Statut', render: (row: any) => <AppBadge variant={row.isVoided ? 'error' : 'success'}>{row.isVoided ? 'Annule' : 'Valide'}</AppBadge> },
    { key: 'createdAt', label: 'Date', render: (row: any) => formatDateTime(row.createdAt) },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions actions={[
          { label: 'Voir details', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/disbursements/${row.id}`) },
          { label: 'Annuler', icon: <Ban className="h-4 w-4" />, onClick: () => router.push(`/disbursements/${row.id}`), variant: 'destructive', disabled: row.isVoided },
        ]} />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bons de decaissement</h1>
            <p className="text-sm text-gray-500 mt-1">Depenses tracables avec verification de solde.</p>
          </div>
          <AppButton onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau decaissement</AppButton>
        </div>

        {/* Search --- Export | Filtres | Effacer */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher un decaissement..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="decaissements" />
            <FilterDialog fields={filterFields} />
          </div>
        </div>

        <AppCard padding="sm">
          <AppDataTable columns={columns} data={data?.data || []} isLoading={isLoading} page={page} totalPages={data?.meta?.totalPages || 1} total={data?.meta?.total} onPageChange={setPage} />
        </AppCard>
      </div>
      <DisbursementFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </PageTransition>
  );
}
