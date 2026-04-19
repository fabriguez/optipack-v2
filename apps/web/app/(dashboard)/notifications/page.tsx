'use client';

import { Suspense, useState } from 'react';
import { Bell, Check, Mail, MessageSquare, Smartphone } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { SearchBar } from '@/components/shared/SearchBar';
import { AppCard } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api/notifications';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { formatDateTime } from '@transitsoftservices/shared';
import { toast } from 'sonner';

const TYPE_LABELS: Record<string, string> = {
  EMAIL: 'Email',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
  PUSH: 'Push',
  IN_APP: 'App',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  EMAIL: <Mail className="h-4 w-4 text-primary-600" />,
  SMS: <Smartphone className="h-4 w-4 text-primary-600" />,
  WHATSAPP: <MessageSquare className="h-4 w-4 text-primary-600" />,
  PUSH: <Bell className="h-4 w-4 text-primary-600" />,
  IN_APP: <Bell className="h-4 w-4 text-primary-600" />,
};

const TYPE_VARIANT: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  EMAIL: 'info',
  SMS: 'warning',
  WHATSAPP: 'success',
  PUSH: 'default',
  IN_APP: 'default',
};

const STATUS_FILTERS = [
  { value: '', label: 'Toutes' },
  { value: 'unread', label: 'Non lues' },
  { value: 'read', label: 'Lues' },
];

function NotificationsContent() {
  const queryClient = useQueryClient();
  const { page, search, setPage, setSearch, queryParams } = useServerPagination({ defaultLimit: 20 });
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', { ...queryParams, status: statusFilter || undefined }],
    queryFn: () =>
      notificationsApi.list({
        page: queryParams.page,
        limit: queryParams.limit,
        search: queryParams.search,
        status: statusFilter || undefined,
      }),
  });

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
    onError: () => {
      toast.error('Erreur lors du marquage de la notification');
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      toast.success('Toutes les notifications ont ete marquees comme lues');
    },
    onError: () => {
      toast.error('Erreur lors du marquage des notifications');
    },
  });

  if (isLoading) return <DashboardSkeleton />;

  const notifications = data?.data || [];
  const meta = data?.meta || { total: 0, page: 1, limit: 20, totalPages: 1 };
  const unreadCount = unreadData?.count ?? 0;

  const columns = [
    {
      key: 'notification',
      label: 'Notification',
      render: (notif: any) => (
        <div className="flex gap-3 items-start">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50">
            {TYPE_ICONS[notif.type] || <Bell className="h-4 w-4 text-primary-600" />}
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-medium ${notif.readAt ? 'text-gray-600' : 'text-gray-900'}`}>
              {notif.title}
            </p>
            <p className="text-sm text-gray-500 mt-0.5 truncate max-w-md">{notif.message}</p>
            <p className="text-xs text-gray-400 mt-1">{formatDateTime(notif.createdAt)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      render: (notif: any) => (
        <AppBadge variant={TYPE_VARIANT[notif.type] || 'default'}>
          {TYPE_LABELS[notif.type] || notif.type}
        </AppBadge>
      ),
    },
    {
      key: 'status',
      label: 'Statut',
      render: (notif: any) => (
        <AppBadge variant={notif.readAt ? 'default' : 'warning'}>
          {notif.readAt ? 'Lu' : 'Non lu'}
        </AppBadge>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (notif: any) =>
        !notif.readAt ? (
          <AppButton
            variant="ghost"
            size="sm"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              markAsReadMutation.mutate(notif.id);
            }}
            disabled={markAsReadMutation.isPending}
          >
            <Check className="h-4 w-4" />
            Marquer lu
          </AppButton>
        ) : null,
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="text-sm text-gray-500 mt-1">
              {meta.total} notification{meta.total !== 1 ? 's' : ''}
              {unreadCount > 0 && (
                <span className="ml-2">
                  (<span className="font-medium text-primary-600">{unreadCount} non lue{unreadCount !== 1 ? 's' : ''}</span>)
                </span>
              )}
            </p>
          </div>
          <AppButton
            variant="outline"
            size="sm"
            onClick={() => markAllAsReadMutation.mutate()}
            disabled={unreadCount === 0 || markAllAsReadMutation.isPending}
          >
            <Check className="h-4 w-4" />
            Tout marquer comme lu
          </AppButton>
        </div>

        <div className="flex items-center gap-3">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Rechercher une notification..."
          />
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => {
                  setStatusFilter(f.value);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === f.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {notifications.length === 0 ? (
          <AppCard>
            <div className="flex flex-col items-center py-12">
              <Bell className="h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-400">Aucune notification</p>
              <p className="text-xs text-gray-300 mt-1">
                Les notifications apparaitront ici en temps reel.
              </p>
            </div>
          </AppCard>
        ) : (
          <AppCard padding="sm">
            <AppDataTable
              columns={columns}
              data={notifications}
              page={meta.page}
              totalPages={meta.totalPages}
              onPageChange={setPage}
              onRowClick={(notif: any) => {
                if (!notif.readAt) {
                  markAsReadMutation.mutate(notif.id);
                }
              }}
            />
          </AppCard>
        )}
      </div>
    </PageTransition>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <NotificationsContent />
    </Suspense>
  );
}
