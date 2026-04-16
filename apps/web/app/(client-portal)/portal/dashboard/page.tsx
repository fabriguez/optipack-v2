'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Package,
  Truck,
  CheckCircle,
  FileWarning,
  ArrowRight,
} from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { clientPortalApi } from '@/lib/api/client-portal';

interface DashboardData {
  client: { name: string; phone: string };
  stats: {
    totalParcels: number;
    inTransit: number;
    delivered: number;
    unpaidInvoices: number;
  };
  recentParcels: Array<{
    id: string;
    tracking: string;
    designation: string;
    status: string;
    createdAt: string;
  }>;
  recentNotifications: Array<{
    id: string;
    title: string;
    message: string;
    read: boolean;
    createdAt: string;
  }>;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
  RECEIVED: { label: 'Recu', variant: 'info' },
  IN_STOCK: { label: 'En stock', variant: 'default' },
  IN_TRANSIT: { label: 'En transit', variant: 'warning' },
  ARRIVED: { label: 'Arrive', variant: 'info' },
  DELIVERED: { label: 'Livre', variant: 'success' },
  LOST: { label: 'Perdu', variant: 'error' },
};

export default function PortalDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientPortalApi
      .getDashboard()
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <AppSkeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <AppSkeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AppSkeleton className="h-64 rounded-2xl" />
          <AppSkeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  const stats = data?.stats;
  const kpis = [
    {
      label: 'Total Colis',
      value: stats?.totalParcels ?? 0,
      icon: Package,
      iconBg: 'bg-primary-50',
      iconColor: 'text-primary-600',
      barColor: 'bg-primary-500',
    },
    {
      label: 'En Transit',
      value: stats?.inTransit ?? 0,
      icon: Truck,
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      barColor: 'bg-amber-500',
    },
    {
      label: 'Livres',
      value: stats?.delivered ?? 0,
      icon: CheckCircle,
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600',
      barColor: 'bg-primary-700',
    },
    {
      label: 'Factures Impayees',
      value: stats?.unpaidInvoices ?? 0,
      icon: FileWarning,
      iconBg: 'bg-red-50',
      iconColor: 'text-red-500',
      barColor: 'bg-red-500',
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Bienvenue, {data?.client?.name ?? 'Client'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Voici un apercu de vos expeditions et factures.
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <AppCard
              key={kpi.label}
              className="relative overflow-hidden group hover:shadow-elevated transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    {kpi.label}
                  </p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">
                    {kpi.value}
                  </p>
                </div>
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${kpi.iconBg}`}
                >
                  <kpi.icon className={`h-5 w-5 ${kpi.iconColor}`} />
                </div>
              </div>
              <div
                className={`absolute bottom-0 left-0 h-1 w-full ${kpi.barColor} opacity-80`}
              />
            </AppCard>
          ))}
        </div>

        {/* Recent parcels + Notifications */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent Parcels */}
          <AppCard>
            <AppCardHeader
              title="Colis recents"
              action={
                <button
                  onClick={() => router.push('/portal/parcels')}
                  className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                >
                  Voir tout
                  <ArrowRight className="h-3 w-3" />
                </button>
              }
            />
            <div className="space-y-2">
              {(data?.recentParcels || []).length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">
                  Aucun colis pour le moment.
                </p>
              ) : (
                data?.recentParcels.map((parcel) => {
                  const statusInfo = STATUS_MAP[parcel.status] || {
                    label: parcel.status,
                    variant: 'default' as const,
                  };
                  return (
                    <div
                      key={parcel.id}
                      className="flex items-center justify-between rounded-xl bg-gray-50 p-3 hover:bg-gray-100 transition-colors cursor-pointer"
                      onClick={() => router.push('/portal/parcels')}
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {parcel.tracking}
                        </p>
                        <p className="text-xs text-gray-500">
                          {parcel.designation}
                        </p>
                      </div>
                      <AppBadge variant={statusInfo.variant}>
                        {statusInfo.label}
                      </AppBadge>
                    </div>
                  );
                })
              )}
            </div>
          </AppCard>

          {/* Recent Notifications */}
          <AppCard>
            <AppCardHeader title="Notifications recentes" />
            <div className="space-y-2">
              {(data?.recentNotifications || []).length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">
                  Aucune notification.
                </p>
              ) : (
                data?.recentNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`rounded-xl p-3 ${
                      notif.read ? 'bg-gray-50' : 'bg-primary-50/50 border border-primary-100'
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900">
                      {notif.title}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {notif.message}
                    </p>
                    <p className="mt-1 text-[10px] text-gray-400">
                      {new Date(notif.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </AppCard>
        </div>
      </div>
    </PageTransition>
  );
}
