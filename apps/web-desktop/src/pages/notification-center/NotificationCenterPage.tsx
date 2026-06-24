import { Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Paperclip, RotateCw, Send, Eye } from 'lucide-react';
import { formatDateTime } from '@transitsoftservices/shared';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { RowActions } from '@/components/shared/RowActions';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { searchers } from '@/lib/api/searchers';
import { extractApiError } from '@/lib/api/errorMessage';
import {
  notificationsApi,
  type AdminNotification,
  type AdminNotificationParams,
} from '@/lib/api/notifications';
import {
  CHANNEL_LABEL,
  CHANNEL_VARIANT,
  STATUS_LABEL,
  STATUS_VARIANT,
  CHANNEL_OPTIONS,
  STATUS_OPTIONS,
  EVENT_KIND_OPTIONS,
  eventKindLabel,
  canRetry,
} from './constants';
import { StatsHeader } from './StatsHeader';
import { NotificationDetailDialog } from './NotificationDetailDialog';

function NotificationCenterContent() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { page, search, setPage, setSearch, queryParams } = useServerPagination();
  const [selected, setSelected] = useState<AdminNotification | null>(null);

  // Filtres lus depuis l'URL (geres par FilterDialog).
  const filters: AdminNotificationParams = {
    type: searchParams.get('type') || undefined,
    status: searchParams.get('status') || undefined,
    clientId: searchParams.get('clientId') || undefined,
    eventKind: searchParams.get('eventKind') || undefined,
    dateFrom: searchParams.get('dateFrom') || undefined,
    dateTo: searchParams.get('dateTo') || undefined,
  };

  const listParams: AdminNotificationParams = {
    page: queryParams.page,
    limit: queryParams.limit,
    search: queryParams.search,
    ...filters,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-admin', listParams],
    queryFn: () => notificationsApi.adminList(listParams),
  });

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['notifications-admin-stats', filters],
    queryFn: () => notificationsApi.adminStats(filters),
  });

  const retryMut = useMutation({
    mutationFn: (id: string) => notificationsApi.retry(id),
    onSuccess: (res) => {
      toast.success(res?.message || 'Notification renvoyee');
      queryClient.invalidateQueries({ queryKey: ['notifications-admin'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-admin-stats'] });
      setSelected(null);
    },
    onError: (e) => toast.error(extractApiError(e, 'Echec du renvoi')),
  });

  const filterFields = [
    { key: 'type', label: 'Canal', type: 'select' as const, options: CHANNEL_OPTIONS },
    { key: 'status', label: 'Statut', type: 'select' as const, options: STATUS_OPTIONS },
    { key: 'clientId', label: 'Client', type: 'search-select' as const, searcher: searchers.clients },
    { key: 'eventKind', label: 'Objet', type: 'select' as const, options: EVENT_KIND_OPTIONS },
    { key: 'dateFrom', label: 'Date debut', type: 'date' as const },
    { key: 'dateTo', label: 'Date fin', type: 'date' as const },
  ];

  const columns = [
    {
      key: 'createdAt',
      label: 'Date',
      render: (row: AdminNotification) => (
        <span className="text-xs text-gray-500">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: 'type',
      label: 'Canal',
      render: (row: AdminNotification) => (
        <AppBadge variant={CHANNEL_VARIANT[row.type]}>{CHANNEL_LABEL[row.type]}</AppBadge>
      ),
    },
    {
      key: 'eventKind',
      label: 'Objet',
      render: (row: AdminNotification) => (
        <span className="text-sm">{eventKindLabel(row.eventKind)}</span>
      ),
    },
    {
      key: 'client',
      label: 'Client',
      render: (row: AdminNotification) => (
        <span className="text-sm">{row.client?.fullName || '-'}</span>
      ),
    },
    {
      key: 'recipient',
      label: 'Destinataire',
      render: (row: AdminNotification) => (
        <span className="text-sm text-gray-500">{row.recipient || '-'}</span>
      ),
    },
    {
      key: 'status',
      label: 'Statut',
      render: (row: AdminNotification) => (
        <AppBadge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</AppBadge>
      ),
    },
    {
      key: 'attachments',
      label: 'Pieces jointes',
      render: (row: AdminNotification) => {
        const count = row.attachments?.length ?? 0;
        if (count === 0) return <span className="text-sm text-gray-300">-</span>;
        return (
          <span className="inline-flex items-center gap-1 text-sm text-gray-600">
            <Paperclip className="h-3.5 w-3.5 text-gray-400" />
            {count}
          </span>
        );
      },
    },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: AdminNotification) => (
        <RowActions
          actions={[
            { label: 'Voir le detail', icon: <Eye className="h-4 w-4" />, onClick: () => setSelected(row) },
            ...(canRetry(row.status, row.type)
              ? [{ label: 'Renvoyer', icon: <RotateCw className="h-4 w-4" />, onClick: () => retryMut.mutate(row.id) }]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Centre de notifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            File d&apos;envoi des notifications clients ({data?.meta?.total ?? 0})
          </p>
        </div>

        <StatsHeader stats={statsData?.data} isLoading={statsLoading} />

        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Objet, message, destinataire..." />
          </div>
          <FilterDialog fields={filterFields} />
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
            onRowClick={(row) => setSelected(row)}
            emptyMessage="Aucune notification"
            emptyIcon={<Send className="h-10 w-10 text-gray-300" />}
          />
        </AppCard>

        <NotificationDetailDialog
          notification={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          onRetry={(id) => retryMut.mutate(id)}
          retrying={retryMut.isPending}
        />
      </div>
    </PageTransition>
  );
}

export default function NotificationCenterPage() {
  return (
    <Suspense>
      <NotificationCenterContent />
    </Suspense>
  );
}
