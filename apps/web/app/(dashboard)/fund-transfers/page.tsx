'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, ArrowRightLeft, Eye, CheckCircle, Ban } from 'lucide-react';
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
import { fundTransfersApi } from '@/lib/api/finance';
import { searchers } from '@/lib/api/searchers';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';
import { FundTransferFormDialog } from './FundTransferFormDialog';

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'error'> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  VOIDED: 'error',
};

export default function FundTransfersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const statusFilter = searchParams.get('status') || '';
  const sourceAgencyId = searchParams.get('sourceAgencyId') || '';
  const destinationAgencyId = searchParams.get('destinationAgencyId') || '';
  const referenceFilter = searchParams.get('reference') || '';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';
  const sourcePaymentMethod = searchParams.get('sourcePaymentMethod') || '';
  const destinationPaymentMethod = searchParams.get('destinationPaymentMethod') || '';
  const minAmount = searchParams.get('minAmount') || '';
  const maxAmount = searchParams.get('maxAmount') || '';

  const { data, isLoading } = useQuery({
    queryKey: ['fund-transfers', { page, search, statusFilter, sourceAgencyId, destinationAgencyId, referenceFilter, dateFrom, dateTo, sourcePaymentMethod, destinationPaymentMethod, minAmount, maxAmount }],
    queryFn: () => fundTransfersApi.list({
      page,
      limit: 20,
      search: search || undefined,
      status: statusFilter || undefined,
      sourceAgencyId: sourceAgencyId || undefined,
      destinationAgencyId: destinationAgencyId || undefined,
      reference: referenceFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sourcePaymentMethod: sourcePaymentMethod || undefined,
      destinationPaymentMethod: destinationPaymentMethod || undefined,
      minAmount: minAmount || undefined,
      maxAmount: maxAmount || undefined,
    } as any),
  });

  const exportColumns = [
    { key: 'reference', label: 'Reference' },
    { key: 'sourceAgency', label: 'Agence source' },
    { key: 'destinationType', label: 'Destination' },
    { key: 'amount', label: 'Montant' },
    { key: 'status', label: 'Statut' },
  ];

  const filterFields = [
    { key: 'reference', label: 'Reference', type: 'text' as const },
    {
      key: 'status',
      label: 'Statut',
      type: 'select' as const,
      options: [
        { value: 'PENDING', label: 'En attente' },
        { value: 'CONFIRMED', label: 'Confirme' },
        { value: 'VOIDED', label: 'Annule' },
      ],
    },
    { key: 'sourceAgencyId', label: 'Agence source', type: 'search-select' as const, searcher: searchers.agencies },
    { key: 'destinationAgencyId', label: 'Agence destination', type: 'search-select' as const, searcher: searchers.agencies },
    { key: 'dateFrom', label: 'Date debut', type: 'date' as const },
    { key: 'dateTo', label: 'Date fin', type: 'date' as const },
    { key: 'sourcePaymentMethod', label: 'Methode source', type: 'text' as const },
    { key: 'destinationPaymentMethod', label: 'Methode destination', type: 'text' as const },
    { key: 'minAmount', label: 'Montant min', type: 'text' as const },
    { key: 'maxAmount', label: 'Montant max', type: 'text' as const },
  ];

  const columns = [
    { key: 'reference', label: 'Reference', render: (row: any) => <Link href={`/fund-transfers/${row.id}`} className="font-mono text-xs text-primary-700 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{row.reference}</Link> },
    { key: 'sourceAgency', label: 'Agence source', render: (row: any) => row.sourceAgency?.name || '-' },
    { key: 'destinationType', label: 'Destination', render: (row: any) => row.destinationType === 'HQ' ? 'Siege' : row.destinationType === 'BANK' ? 'Banque' : 'Agence' },
    { key: 'amount', label: 'Montant', render: (row: any) => <span className="font-semibold">{formatAmount(Number(row.amount))}</span> },
    { key: 'transferMethod', label: 'Mode' },
    { key: 'status', label: 'Statut', render: (row: any) => <AppBadge variant={STATUS_VARIANT[row.status] || 'default'}>{row.status === 'PENDING' ? 'En attente' : row.status === 'CONFIRMED' ? 'Confirme' : 'Annule'}</AppBadge> },
    { key: 'createdAt', label: 'Date', render: (row: any) => formatDateTime(row.createdAt) },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions actions={[
          { label: 'Voir details', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/fund-transfers/${row.id}`) },
          { label: 'Confirmer', icon: <CheckCircle className="h-4 w-4" />, onClick: () => router.push(`/fund-transfers/${row.id}`), disabled: row.status !== 'PENDING' },
          { label: 'Annuler', icon: <Ban className="h-4 w-4" />, onClick: () => router.push(`/fund-transfers/${row.id}`), variant: 'destructive', disabled: row.isVoided || row.status === 'VOIDED' },
        ]} />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transferts de fonds</h1>
            <p className="text-sm text-gray-500 mt-1">Transferts d'argent des agences vers le siege.</p>
          </div>
          <AppButton onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau transfert</AppButton>
        </div>

        {/* Search --- Export | Filtres | Effacer */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher un transfert..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="transferts-fonds" />
            <FilterDialog fields={filterFields} />
          </div>
        </div>

        <AppCard padding="sm">
          <AppDataTable columns={columns} data={data?.data || []} isLoading={isLoading} page={page} totalPages={data?.meta?.totalPages || 1} total={data?.meta?.total} onPageChange={setPage} />
        </AppCard>
      </div>
      <FundTransferFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </PageTransition>
  );
}
