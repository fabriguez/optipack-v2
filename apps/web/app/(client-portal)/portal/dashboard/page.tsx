'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Package,
  Truck,
  CheckCircle,
  PackageCheck,
  FileWarning,
  Wallet,
  Bell,
  MessageCircle,
  ArrowRight,
} from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { clientPortalApi } from '@/lib/api/client-portal';

interface DashboardData {
  parcels: {
    total: number;
    inTransit: number;
    arrived: number;
    delivered: number;
  };
  invoices: {
    unpaidCount: number;
    unpaidBalance: number;
  };
  debts: {
    remaining: number;
  };
  inbox: {
    unreadNotifications: number;
    openConversations: number;
  };
  recentParcels: Array<{
    id: string;
    trackingNumber: string;
    designation: string;
    status: string;
    destination: string;
    updatedAt: string;
  }>;
}

const STATUS_MAP: Record<
  string,
  { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' }
> = {
  RECEIVED: { label: 'Recu', variant: 'info' },
  IN_STOCK: { label: 'En stock', variant: 'default' },
  LOADING: { label: 'Chargement', variant: 'warning' },
  IN_TRANSIT: { label: 'En transit', variant: 'warning' },
  ARRIVED: { label: 'Arrive', variant: 'info' },
  DELIVERED: { label: 'Livre', variant: 'success' },
  LOST: { label: 'Perdu', variant: 'error' },
};

function formatXAF(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XAF',
    maximumFractionDigits: 0,
  }).format(n);
}

export default function PortalDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      clientPortalApi.getDashboard().then((r) => r.data as DashboardData),
      clientPortalApi
        .me()
        .then((r) => r.data?.fullName as string | undefined)
        .catch(() => undefined),
    ])
      .then(([dashboard, name]) => {
        if (!mounted) return;
        setData(dashboard);
        if (name) setClientName(name);
      })
      .catch(() => {})
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
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

  const parcels = data?.parcels;
  const kpis = [
    {
      label: 'Total Colis',
      value: parcels?.total ?? 0,
      icon: Package,
      iconBg: 'bg-primary-50',
      iconColor: 'text-primary-600',
      barColor: 'bg-primary-500',
      href: '/portal/parcels',
    },
    {
      label: 'En Transit',
      value: parcels?.inTransit ?? 0,
      icon: Truck,
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      barColor: 'bg-amber-500',
      href: '/portal/parcels?status=IN_TRANSIT',
    },
    {
      label: 'Arrives',
      value: parcels?.arrived ?? 0,
      icon: PackageCheck,
      iconBg: 'bg-sky-50',
      iconColor: 'text-sky-600',
      barColor: 'bg-sky-500',
      href: '/portal/parcels?status=ARRIVED',
    },
    {
      label: 'Livres',
      value: parcels?.delivered ?? 0,
      icon: CheckCircle,
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600',
      barColor: 'bg-primary-700',
      href: '/portal/parcels?status=DELIVERED',
    },
  ];

  const finance = [
    {
      label: 'Factures impayees',
      value: data?.invoices.unpaidCount ?? 0,
      sub: formatXAF(data?.invoices.unpaidBalance ?? 0),
      icon: FileWarning,
      iconBg: 'bg-red-50',
      iconColor: 'text-red-500',
      href: '/portal/invoices',
    },
    {
      label: 'Dettes restantes',
      value: formatXAF(data?.debts.remaining ?? 0),
      sub: 'cumul actif',
      icon: Wallet,
      iconBg: 'bg-orange-50',
      iconColor: 'text-orange-500',
      href: '/portal/debts',
    },
    {
      label: 'Notifications',
      value: data?.inbox.unreadNotifications ?? 0,
      sub: 'non lues',
      icon: Bell,
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-500',
      href: '/portal/notifications',
    },
    {
      label: 'Conversations',
      value: data?.inbox.openConversations ?? 0,
      sub: 'ouvertes',
      icon: MessageCircle,
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-500',
      href: '/portal/support',
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Bienvenue{clientName ? `, ${clientName}` : ''}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Suivi de vos colis, factures, paiements et echanges avec
            l&apos;agence.
          </p>
        </div>

        {/* KPI colis */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <Link href={kpi.href} key={kpi.label} className="block">
              <AppCard className="relative overflow-hidden transition-shadow hover:shadow-elevated">
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
            </Link>
          ))}
        </div>

        {/* KPI finance + inbox */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {finance.map((kpi) => (
            <Link href={kpi.href} key={kpi.label} className="block">
              <AppCard className="transition-shadow hover:shadow-elevated">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                      {kpi.label}
                    </p>
                    <p className="mt-2 truncate text-xl font-bold text-gray-900">
                      {kpi.value}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {kpi.sub}
                    </p>
                  </div>
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${kpi.iconBg}`}
                  >
                    <kpi.icon className={`h-5 w-5 ${kpi.iconColor}`} />
                  </div>
                </div>
              </AppCard>
            </Link>
          ))}
        </div>

        {/* Recents */}
        <AppCard>
          <AppCardHeader
            title="Colis recents"
            action={
              <button
                onClick={() => router.push('/portal/parcels')}
                className="flex items-center gap-1 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
              >
                Voir tout
                <ArrowRight className="h-3 w-3" />
              </button>
            }
          />
          <div className="space-y-2">
            {(data?.recentParcels ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                Aucun colis pour le moment.
              </p>
            ) : (
              data?.recentParcels.map((parcel) => {
                const statusInfo = STATUS_MAP[parcel.status] ?? {
                  label: parcel.status,
                  variant: 'default' as const,
                };
                return (
                  <button
                    key={parcel.id}
                    onClick={() =>
                      router.push(`/portal/parcels/${parcel.trackingNumber}`)
                    }
                    className="flex w-full items-center justify-between rounded-xl bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {parcel.trackingNumber}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {parcel.designation} - {parcel.destination}
                      </p>
                    </div>
                    <AppBadge variant={statusInfo.variant}>
                      {statusInfo.label}
                    </AppBadge>
                  </button>
                );
              })
            )}
          </div>
        </AppCard>
      </div>
    </PageTransition>
  );
}
