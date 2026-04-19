'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppBadge } from '@/components/ui/AppBadge';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { RowActions } from '@/components/shared/RowActions';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate } from '@transitsoftservices/shared';

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  ACTIVE: 'warning', PARTIALLY_PAID: 'info' as any, CLEARED: 'success', OVERDUE: 'error',
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active', PARTIALLY_PAID: 'Partiellement payee', CLEARED: 'Soldee', OVERDUE: 'En retard',
};

export default function DebtsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const statusFilter = searchParams.get('status') || '';

  const { data, isLoading } = useQuery({
    queryKey: ['debts', { page, status: statusFilter }],
    queryFn: () => apiClient.get('/debts', {
      params: {
        page,
        limit: 20,
        status: statusFilter || undefined,
      },
    }).then((r) => r.data),
  });

  const exportColumns = [
    { key: 'client', label: 'Client' },
    { key: 'description', label: 'Description' },
    { key: 'totalAmount', label: 'Montant total' },
    { key: 'remainingAmount', label: 'Restant' },
    { key: 'status', label: 'Statut' },
  ];

  const filterFields = [
    {
      key: 'status',
      label: 'Statut',
      type: 'select' as const,
      options: [
        { value: 'ACTIVE', label: 'Active' },
        { value: 'PARTIALLY_PAID', label: 'Partiellement payee' },
        { value: 'CLEARED', label: 'Soldee' },
        { value: 'OVERDUE', label: 'En retard' },
      ],
    },
  ];

  const columns = [
    { key: 'client', label: 'Client', render: (row: any) => <Link href={`/debts/${row.id}`} className="text-primary-700 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{row.client?.fullName || '-'}</Link> },
    { key: 'description', label: 'Description' },
    { key: 'totalAmount', label: 'Montant total', render: (row: any) => formatAmount(Number(row.totalAmount)) },
    { key: 'remainingAmount', label: 'Restant', render: (row: any) => <span className="font-semibold text-red-600">{formatAmount(Number(row.remainingAmount))}</span> },
    { key: 'nextDueDate', label: 'Prochaine echeance', render: (row: any) => row.nextDueDate ? formatDate(row.nextDueDate) : '-' },
    { key: 'status', label: 'Statut', render: (row: any) => <AppBadge variant={STATUS_VARIANT[row.status] || 'default'}>{STATUS_LABEL[row.status] || row.status}</AppBadge> },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions actions={[
          { label: 'Voir details', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/debts/${row.id}`) },
        ]} />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dettes</h1>
          <p className="text-sm text-gray-500 mt-1">Suivi des dettes clients et echeanciers.</p>
        </div>

        {/* Search --- Export | Filtres | Effacer */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher une dette..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="dettes" />
            <FilterDialog fields={filterFields} />
          </div>
        </div>

        <AppCard padding="sm">
          <AppDataTable columns={columns} data={data?.data || []} isLoading={isLoading} page={page} totalPages={data?.meta?.totalPages || 1} total={data?.meta?.total} onPageChange={setPage} />
        </AppCard>
      </div>
    </PageTransition>
  );
}
