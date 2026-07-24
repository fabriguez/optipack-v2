'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppSelect } from '@/components/ui/AppSelect';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { searchers } from '@/lib/api/searchers';
import { useQuery } from '@tanstack/react-query';
import { accountingApi } from '@/lib/api/finance';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';

const SOURCE_LABELS: Record<string, string> = {
  PAYMENT: 'Paiement',
  DISBURSEMENT: 'Decaissement',
  TRANSFER: 'Transfert',
  EXPENSE: 'Depense',
  PENALTY: 'Penalite',
  SALARY: 'Salaire',
};

const filterFields = [
  { key: 'agencyId', label: 'Agence', type: 'search-select' as const, searcher: searchers.myAgencies },
  {
    key: 'sourceType',
    label: 'Source',
    type: 'select' as const,
    options: Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label })),
  },
  { key: 'dateFrom', label: 'Du', type: 'date' as const },
  { key: 'dateTo', label: 'Au', type: 'date' as const },
];

const sumDebit = (row: any) => (row.lines || []).reduce((s: number, l: any) => s + Number(l.debitAmount || 0), 0);
const sumCredit = (row: any) => (row.lines || []).reduce((s: number, l: any) => s + Number(l.creditAmount || 0), 0);

function AccountingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { page, search, setPage, setSearch, queryParams } = useServerPagination();
  // Tri de la page affichee (le tri par montant global n'est pas possible cote
  // serveur : debit/credit vivent sur les lignes, pas de colonne agregee triable).
  const [sortByAmount, setSortByAmount] = useState<'' | 'debit' | 'credit'>('');

  const agencyId = searchParams.get('agencyId') || '';
  const sourceType = searchParams.get('sourceType') || '';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', { ...queryParams, agencyId, sourceType, dateFrom, dateTo }],
    queryFn: () =>
      accountingApi.getLedger({
        ...queryParams,
        limit: 20,
        agencyId: agencyId || undefined,
        sourceType: sourceType || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });

  const rows: any[] = data?.data || [];
  const totals = data?.meta?.totals as { debit: number; credit: number } | undefined;

  const sortedRows = useMemo(() => {
    if (!sortByAmount) return rows;
    const fn = sortByAmount === 'debit' ? sumDebit : sumCredit;
    return [...rows].sort((a, b) => fn(b) - fn(a));
  }, [rows, sortByAmount]);

  const exportData = useMemo(
    () =>
      rows.map((r) => ({
        reference: r.reference,
        description: r.description,
        source: SOURCE_LABELS[r.sourceType] || r.sourceType,
        debit: sumDebit(r),
        credit: sumCredit(r),
        date: formatDateTime(r.date),
      })),
    [rows],
  );

  const exportColumns = [
    { key: 'reference', label: 'Reference' },
    { key: 'description', label: 'Description' },
    { key: 'source', label: 'Source' },
    { key: 'debit', label: 'Debit' },
    { key: 'credit', label: 'Credit' },
    { key: 'date', label: 'Date' },
  ];

  const columns = [
    { key: 'reference', label: 'Reference', render: (row: any) => <span className="font-mono text-xs">{row.reference}</span> },
    { key: 'description', label: 'Description' },
    { key: 'sourceType', label: 'Source', render: (row: any) => <AppBadge variant="info">{SOURCE_LABELS[row.sourceType] || row.sourceType}</AppBadge> },
    {
      key: 'debit',
      label: 'Debit',
      render: (row: any) => { const t = sumDebit(row); return t > 0 ? <span className="font-semibold text-primary-700">{formatAmount(t)}</span> : '-'; },
    },
    {
      key: 'credit',
      label: 'Credit',
      render: (row: any) => { const t = sumCredit(row); return t > 0 ? <span className="font-semibold text-red-600">{formatAmount(t)}</span> : '-'; },
    },
    {
      key: 'createdBy',
      label: 'Par',
      render: (row: any) => {
        const u = row.createdBy;
        const name = u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : '';
        return name ? <span className="text-xs text-gray-600">{name}</span> : <span className="text-xs text-gray-400">-</span>;
      },
    },
    { key: 'date', label: 'Date', render: (row: any) => formatDateTime(row.date) },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Grand Livre</h1>
            <p className="text-sm text-gray-500 mt-1">Journal comptable avec ecritures debit/credit.</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Reference, description..." />
          </div>
          <div className="flex items-center gap-2">
            <AppSelect
              value={sortByAmount}
              onChange={(e) => setSortByAmount(e.target.value as '' | 'debit' | 'credit')}
              options={[
                { value: '', label: 'Tri : date' },
                { value: 'debit', label: 'Tri : debit (page)' },
                { value: 'credit', label: 'Tri : credit (page)' },
              ]}
            />
            <ExportButton data={exportData} columns={exportColumns} fileName="grand-livre" />
            <FilterDialog fields={filterFields} />
          </div>
        </div>

        {/* Totaux de la periode filtree (tout l'ensemble, pas seulement la page). */}
        {totals && (
          <div className="flex flex-wrap gap-3">
            <AppCard className="flex-1 min-w-45">
              <p className="text-sm text-gray-500">Total debit (periode)</p>
              <p className="mt-1 text-lg font-bold text-primary-700">{formatAmount(totals.debit)}</p>
            </AppCard>
            <AppCard className="flex-1 min-w-45">
              <p className="text-sm text-gray-500">Total credit (periode)</p>
              <p className="mt-1 text-lg font-bold text-red-600">{formatAmount(totals.credit)}</p>
            </AppCard>
          </div>
        )}

        <AppCard padding="sm">
          <AppDataTable
            columns={columns}
            data={sortedRows}
            isLoading={isLoading}
            page={page}
            totalPages={data?.meta?.totalPages || 1}
            total={data?.meta?.total}
            limit={queryParams.limit}
            onPageChange={setPage}
            onRowClick={(row: any) => router.push(`/accounting/journal/${row.id}`)}
          />
        </AppCard>
      </div>
    </PageTransition>
  );
}

export default function AccountingPage() {
  return <Suspense><AccountingContent /></Suspense>;
}
