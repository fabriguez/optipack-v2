'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bell, BellOff, Check, CheckCheck } from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { PageTransition } from '@/components/shared/PageTransition';
import { clientPortalApi } from '@/lib/api/client-portal';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  status: string;
  readAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

const LIMIT = 30;

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PortalNotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    clientPortalApi
      .getNotifications({ page: 1, limit: LIMIT })
      .then((res) => setItems(res.data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const unread = items.filter((i) => !i.readAt).length;

  async function markOne(id: string) {
    await clientPortalApi.markNotificationRead(id).catch(() => {});
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, readAt: new Date().toISOString(), status: 'READ' } : i,
      ),
    );
  }

  async function markAll() {
    setMarking(true);
    try {
      await clientPortalApi.markAllNotificationsRead();
      reload();
    } finally {
      setMarking(false);
    }
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="mt-1 text-sm text-gray-500">
              Toutes les alertes lies a vos colis, factures, et echanges.
            </p>
          </div>
          {unread > 0 && (
            <AppButton variant="secondary" onClick={markAll} loading={marking}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Tout marquer lu ({unread})
            </AppButton>
          )}
        </div>

        <AppCard>
          <AppCardHeader title="Inbox" />
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <AppSkeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <BellOff className="h-10 w-10 text-gray-300" />
              <p className="text-sm text-gray-400">Aucune notification.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((n) => {
                const unread = !n.readAt;
                return (
                  <li
                    key={n.id}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3 transition-colors',
                      unread
                        ? 'border-primary-100 bg-primary-50/40'
                        : 'border-gray-100 bg-gray-50',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                        unread
                          ? 'bg-primary-100 text-primary-700'
                          : 'bg-gray-100 text-gray-500',
                      )}
                    >
                      <Bell className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-sm',
                          unread ? 'font-semibold text-gray-900' : 'text-gray-700',
                        )}
                      >
                        {n.title}
                      </p>
                      <p className="mt-0.5 text-sm text-gray-600">
                        {n.message}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-400">
                        {formatDateTime(n.createdAt)}
                      </p>
                    </div>
                    {unread && (
                      <button
                        onClick={() => markOne(n.id)}
                        className="rounded-lg bg-white p-2 text-primary-600 hover:bg-primary-100"
                        aria-label="Marquer comme lu"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </AppCard>
      </div>
    </PageTransition>
  );
}
