'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, HandCoins, Eye } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { RowActions } from '@/components/shared/RowActions';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { searchers } from '@/lib/api/searchers';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { Can } from '@/lib/components/Can';
import { ExpenseFormDialog } from './ExpenseFormDialog';

export default function ExpensesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const agencyFilter = searchParams.get('agencyId') || '';
  const categoryFilter = searchParams.get('category') || '';

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', { page, agencyId: agencyFilter, category: categoryFilter }],
    queryFn: () => apiClient.get('/expenses', {
      params: {
        page,
        limit: 20,
        agencyId: agencyFilter || undefined,
        category: categoryFilter || undefined,
      },
    }).then((r) => r.data),
  });

  const exportColumns = [
    { key: 'title', label: 'Titre' },
    { key: 'reason', label: 'Motif' },
    { key: 'category', label: 'Categorie' },
    { key: 'amount', label: 'Montant' },
    { key: 'createdAt', label: 'Date' },
  ];

  const filterFields = [
    {
      key: 'agencyId',
      label: 'Agence',
      type: 'search-select' as const,
      searcher: searchers.myAgencies,
    },
    { key: 'category', label: 'Categorie', type: 'text' as const },
  ];

  const columns = [
    { key: 'title', label: 'Titre', render: (row: any) => <Link href={`/expenses/${row.id}`} className="text-primary-700 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{row.title}</Link> },
    { key: 'reason', label: 'Motif' },
    { key: 'category', label: 'Categorie', render: (row: any) => row.category || '-' },
    { key: 'agency', label: 'Agence', render: (row: any) => row.agency?.name || '-' },
    { key: 'amount', label: 'Montant', render: (row: any) => <span className="font-semibold text-red-600">{formatAmount(Number(row.amount))}</span> },
    { key: 'createdAt', label: 'Date', render: (row: any) => formatDate(row.createdAt) },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions actions={[
          { label: 'Voir details', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/expenses/${row.id}`) },
        ]} />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Depenses</h1>
            <p className="text-sm text-gray-500 mt-1">Suivi des depenses avec justificatifs.</p>
          </div>
          <Can permission="expense.create">
            <AppButton onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouvelle depense</AppButton>
          </Can>
        </div>

        {/* Search --- Export | Filtres | Effacer */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher une depense..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="depenses" />
            <FilterDialog fields={filterFields} />
          </div>
        </div>

        <AppCard padding="sm">
          <AppDataTable columns={columns} data={data?.data || []} isLoading={isLoading} page={page} totalPages={data?.meta?.totalPages || 1} total={data?.meta?.total} onPageChange={setPage} />
        </AppCard>
      </div>
      <ExpenseFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </PageTransition>
  );
}
