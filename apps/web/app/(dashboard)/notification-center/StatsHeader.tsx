'use client';

import { Clock, CheckCircle2, XCircle, Inbox } from 'lucide-react';
import { AppBadge } from '@/components/ui/AppBadge';
import type { AdminNotificationStats, NotificationChannel } from '@/lib/api/notifications';
import { CHANNEL_LABEL, CHANNEL_VARIANT } from './constants';

interface StatsHeaderProps {
  stats?: AdminNotificationStats;
  isLoading?: boolean;
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-card">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>{icon}</div>
      <div>
        <p className="text-lg font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
}

export function StatsHeader({ stats, isLoading }: StatsHeaderProps) {
  const byStatus = stats?.byStatus ?? {};
  const byChannel = stats?.byChannel ?? {};

  if (isLoading && !stats) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  const channels = (Object.keys(byChannel) as NotificationChannel[]).filter(
    (c) => (byChannel[c] ?? 0) > 0,
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total"
          value={stats?.total ?? 0}
          accent="bg-gray-100 text-gray-600"
          icon={<Inbox className="h-4 w-4" />}
        />
        <StatCard
          label="En attente"
          value={byStatus.PENDING ?? 0}
          accent="bg-amber-50 text-amber-600"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Echecs"
          value={byStatus.FAILED ?? 0}
          accent="bg-red-50 text-red-600"
          icon={<XCircle className="h-4 w-4" />}
        />
        <StatCard
          label="Envoyees"
          value={byStatus.SENT ?? 0}
          accent="bg-primary-50 text-primary-600"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      {channels.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400">Par canal :</span>
          {channels.map((c) => (
            <AppBadge key={c} variant={CHANNEL_VARIANT[c]}>
              {CHANNEL_LABEL[c]} : {byChannel[c]}
            </AppBadge>
          ))}
        </div>
      )}
    </div>
  );
}
