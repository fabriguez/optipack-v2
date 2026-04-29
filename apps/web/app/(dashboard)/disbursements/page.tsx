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

  const { data, isLoading } = useQuery({
    queryKey: ['disbursements', { page, agencyId: agencyFilter }],
    queryFn: () => disbursementsApi.list({ page, limit: 20, agencyId: agencyFilter || undefined } as any),
  });

  const exportColumns = [
    { key: 'reference', label: 'Reference' },
    { key: 'reason', label: 'Motif' },
    { key: 'orderer', label: 'Ordonnateur' },
    { key: 'amount', label: 'Montant' },
    { key: 'createdAt', label: 'Date' },
  ];

  const filterFields = [
    {
      key: 'agencyId',
      label: 'Agence',
      type: 'search-select' as const,
      searcher: searchers.agencies,
    },
  ];

  const columns = [
    { key: 'reference', label: 'Reference', render: (row: any) => <Link href={`/disbursements/${row.id}`} className="font-mono text-xs text-primary-700 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{row.reference}</Link> },
    { key: 'reason', label: 'Motif' },
    { key: 'orderer', label: 'Ordonnateur' },
    { key: 'agency', label: 'Agence', render: (row: any) => row.agency?.name || '-' },
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
