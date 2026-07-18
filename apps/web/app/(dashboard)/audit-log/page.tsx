'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppBadge } from '@/components/ui/AppBadge';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatDateTime } from '@transitsoftservices/shared';

const ACTION_COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  CREATE: 'success',
  UPDATE: 'warning',
  DELETE: 'error',
  LOGIN: 'info',
  VOID: 'error',
  PAYMENT: 'success',
};

const filterFields = [
  {
    key: 'action',
    label: 'Action',
    type: 'select' as const,
    options: [
      { value: 'CREATE', label: 'Creation' },
      { value: 'UPDATE', label: 'Modification' },
      { value: 'DELETE', label: 'Suppression' },
      { value: 'VOID', label: 'Annulation' },
      { value: 'LOGIN', label: 'Connexion' },
      { value: 'PAYMENT', label: 'Paiement' },
    ],
  },
  { key: 'entityType', label: 'Entite', type: 'text' as const, placeholder: 'Ex: Invoice, Parcel...' },
  { key: 'dateFrom', label: 'Du', type: 'date' as const },
  { key: 'dateTo', label: 'Au', type: 'date' as const },
];

function AuditLogContent() {
  const searchParams = useSearchParams();
  const { page, search, setPage, setSearch, queryParams } = useServerPagination();

  const actionFilter = searchParams.get('action') || '';
  const entityTypeFilter = searchParams.get('entityType') || '';
  const dateFromFilter = searchParams.get('dateFrom') || '';
  const dateToFilter = searchParams.get('dateTo') || '';

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', { ...queryParams, actionFilter, entityTypeFilter, dateFromFilter, dateToFilter }],
    queryFn: () =>
      apiClient
        .get('/audit', {
          params: {
            ...queryParams,
            limit: 30,
            action: actionFilter || undefined,
            entityType: entityTypeFilter || undefined,
            dateFrom: dateFromFilter || undefined,
            dateTo: dateToFilter || undefined,
          },
        })
        .then((r) => r.data)
        .catch(() => ({ data: [], meta: { total: 0, page: 1, limit: 30, totalPages: 1 } })),
  });

  const columns = [
    { key: 'user', label: 'Utilisateur', render: (row: any) => row.user ? `${row.user.firstName} ${row.user.lastName}` : 'Systeme' },
    { key: 'action', label: 'Action', render: (row: any) => <AppBadge variant={ACTION_COLORS[row.action] || 'default'}>{row.action}</AppBadge> },
    { key: 'entityType', label: 'Entite' },
    { key: 'entityId', label: 'ID', render: (row: any) => row.entityId ? <span className="font-mono text-xs">{row.entityId.substring(0, 8)}...</span> : '-' },
    { key: 'ipAddress', label: 'IP', render: (row: any) => row.ipAddress || '-' },
    { key: 'createdAt', label: 'Date', render: (row: any) => formatDateTime(row.createdAt) },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Journal d'audit</h1>
          <p className="text-sm text-gray-500 mt-1">Tracabilite complete de toutes les actions utilisateur.</p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Action, entite..." />
          </div>
          <FilterDialog fields={filterFields} />
        </div>

        <AppCard padding="sm">
          <AppDataTable columns={columns} data={data?.data || []} isLoading={isLoading} page={page} totalPages={data?.meta?.totalPages || 1} total={data?.meta?.total} onPageChange={setPage} />
        </AppCard>
      </div>
    </PageTransition>
  );
}

export default function AuditLogPage() {
  return <Suspense><AuditLogContent /></Suspense>;
}
