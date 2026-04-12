'use client';

import { Bell, Check } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatDateTime } from '@optipack/shared';

const TYPE_LABELS: Record<string, string> = { EMAIL: 'Email', SMS: 'SMS', WHATSAPP: 'WhatsApp', PUSH: 'Push', IN_APP: 'App' };
const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'error'> = { PENDING: 'warning', SENT: 'success', FAILED: 'error', READ: 'default' };
const STATUS_LABEL: Record<string, string> = { PENDING: 'En attente', SENT: 'Envoye', FAILED: 'Echoue', READ: 'Lu' };

export default function NotificationsPage() {
  // TODO: API /notifications a implementer -- pour l'instant on montre un etat vide
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => Promise.resolve({ data: [], meta: { total: 0 } }),
  });

  if (isLoading) return <DashboardSkeleton />;

  const notifications = data?.data || [];

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="text-sm text-gray-500 mt-1">{notifications.length} notifications</p>
          </div>
          <AppButton variant="outline" size="sm" disabled={notifications.length === 0}>
            <Check className="h-4 w-4" />
            Tout marquer comme lu
          </AppButton>
        </div>

        {notifications.length === 0 ? (
          <AppCard>
            <div className="flex flex-col items-center py-12">
              <Bell className="h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-400">Aucune notification</p>
              <p className="text-xs text-gray-300 mt-1">Les notifications apparaitront ici en temps reel.</p>
            </div>
          </AppCard>
        ) : (
          <div className="space-y-3">
            {notifications.map((notif: any) => (
              <AppCard key={notif.id} padding="sm">
                <div className="flex items-start justify-between">
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50">
                      <Bell className="h-4 w-4 text-primary-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{notif.title}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{notif.message}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatDateTime(notif.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <AppBadge>{TYPE_LABELS[notif.type] || notif.type}</AppBadge>
                    <AppBadge variant={STATUS_VARIANT[notif.status] || 'default'}>{STATUS_LABEL[notif.status] || notif.status}</AppBadge>
                  </div>
                </div>
              </AppCard>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
