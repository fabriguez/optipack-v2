'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Package,
  Truck,
  PackageCheck,
  Warehouse,
  Wallet,
  ArrowRight,
  Bell,
  FileWarning,
  HandCoins,
  Gift,
} from 'lucide-react';
import { formatAmount } from '@transitsoftservices/shared';
import { portalApi } from '@/lib/api/client';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';

interface DashboardData {
  parcels: {
    total: number;
    inTransit: number;
    arrived: number;
    inStorage: number;
    delivered: number;
  };
  invoices: { unpaidCount: number; unpaidBalance: number };
  debts: { remaining: number };
  loyalty: { points: number; tier: string };
  balanceDue: number;
  inbox: { unreadNotifications: number; openConversations: number };
  recentParcels?: Array<{
    id: string;
    trackingNumber: string;
    designation: string;
    status: string;
    destination: string;
    updatedAt: string;
  }>;
  recentNotifications?: Array<{
    id: string;
    title: string;
    message: string;
    type: string;
    readAt: string | null;
    createdAt: string;
  }>;
}

const FALLBACK: DashboardData = {
  parcels: { total: 0, inTransit: 0, arrived: 0, inStorage: 0, delivered: 0 },
  invoices: { unpaidCount: 0, unpaidBalance: 0 },
  debts: { remaining: 0 },
  loyalty: { points: 0, tier: 'STANDARD' },
  balanceDue: 0,
  inbox: { unreadNotifications: 0, openConversations: 0 },
  recentParcels: [],
  recentNotifications: [],
};

export default function DashboardHome() {
  const { meta } = useTenantMeta();
  const defaultCurrency = meta?.defaultCurrency ?? 'XAF';
  const { data = FALLBACK, isLoading } = useQuery<DashboardData>({
    queryKey: ['portal', 'dashboard'],
    queryFn: () => portalApi.getDashboard(),
  });
  const { data: me } = useQuery({
    queryKey: ['portal', 'me'],
    queryFn: () => portalApi.getMe(),
  });
  const firstName = me?.fullName?.trim().split(/\s+/)[0];

  const cards = [
    { label: 'Total colis', value: data.parcels.total, Icon: Package },
    { label: 'En transit', value: data.parcels.inTransit, Icon: Truck },
    { label: 'Arrives', value: data.parcels.arrived, Icon: PackageCheck },
    { label: 'En magasinage', value: data.parcels.inStorage, Icon: Warehouse },
    {
      label: 'Solde a payer',
      value: formatAmount(Number(data.balanceDue), defaultCurrency),
      Icon: Wallet,
    },
    {
      label: 'Factures impayees',
      value: data.invoices.unpaidCount,
      Icon: FileWarning,
    },
    {
      label: 'Dettes actives',
      value: formatAmount(Number(data.debts.remaining), defaultCurrency),
      Icon: HandCoins,
    },
    {
      label: 'Points de fidelite',
      value: data.loyalty.points,
      Icon: Gift,
    },
  ];

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: 'var(--skin-primary)' }}
          >
            Tableau de bord
          </p>
          <h1
            className="mt-1 text-3xl font-bold tracking-tight skin-font-heading"
            style={{ color: 'var(--skin-foreground)' }}
          >
            Bonjour{firstName ? ` ${firstName}` : ''}, content de vous revoir.
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--skin-muted)' }}>
            Voici un apercu de vos envois en cours.
          </p>
        </div>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="p-5 skin-card"
          >
            <div className="flex items-center justify-between">
              <div
                className="flex h-9 w-9 items-center justify-center skin-radius"
                style={{
                  background:
                    'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
                  color: 'var(--skin-primary)',
                }}
              >
                <card.Icon className="h-4 w-4" />
              </div>
            </div>
            <div
              className="mt-4 text-2xl font-bold tracking-tight skin-font-heading"
              style={{ color: 'var(--skin-foreground)' }}
            >
              {isLoading ? '-' : card.value}
            </div>
            <p
              className="mt-0.5 text-sm font-medium"
              style={{ color: 'var(--skin-muted)' }}
            >
              {card.label}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentParcels parcels={data.recentParcels} />
        <RecentNotifications notifications={data.recentNotifications} />
      </div>
    </div>
  );
}

function RecentParcels({
  parcels,
}: {
  parcels: DashboardData['recentParcels'];
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="p-6 skin-card"
    >
      <div className="flex items-center justify-between">
        <h2
          className="text-lg font-semibold skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          Derniers colis
        </h2>
        <Link
          href="/app/parcels"
          className="inline-flex items-center gap-1 text-sm font-semibold"
          style={{ color: 'var(--skin-primary)' }}
        >
          Tout voir
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {parcels && parcels.length > 0 ? (
        <ul className="mt-4 divide-y" style={{ borderColor: 'var(--skin-border)' }}>
          {parcels.map((p) => (
            <li key={p.id}>
              <Link
                href={`/app/parcels/${p.trackingNumber}`}
                className="flex items-center justify-between py-3 transition-colors hover:bg-black/2"
              >
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-semibold"
                  style={{ color: 'var(--skin-foreground)' }}
                >
                  {p.designation || p.trackingNumber}
                </p>
                <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
                  #{p.trackingNumber}
                </p>
              </div>
              <span
                className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide skin-radius-sm"
                style={{
                  background:
                    'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
                  color: 'var(--skin-primary)',
                }}
              >
                {p.status}
              </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyParcels />
      )}
    </motion.section>
  );
}

function RecentNotifications({
  notifications,
}: {
  notifications: DashboardData['recentNotifications'];
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="p-6 skin-card"
    >
      <h2
        className="text-lg font-semibold skin-font-heading"
        style={{ color: 'var(--skin-foreground)' }}
      >
        Notifications recentes
      </h2>

      {notifications && notifications.length > 0 ? (
        <ul className="mt-4 divide-y" style={{ borderColor: 'var(--skin-border)' }}>
          {notifications.map((n) => (
            <li key={n.id} className="flex items-start gap-3 py-3">
              <div
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center skin-radius"
                style={{
                  background: n.readAt
                    ? 'color-mix(in oklab, var(--skin-muted) 12%, transparent)'
                    : 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
                  color: n.readAt ? 'var(--skin-muted)' : 'var(--skin-primary)',
                }}
              >
                <Bell className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-semibold"
                  style={{ color: 'var(--skin-foreground)' }}
                >
                  {n.title}
                </p>
                <p
                  className="line-clamp-2 text-xs"
                  style={{ color: 'var(--skin-muted)' }}
                >
                  {n.message}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 text-center py-10">
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center skin-radius-lg"
            style={{
              background:
                'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
              color: 'var(--skin-primary)',
            }}
          >
            <Bell className="h-6 w-6" />
          </div>
          <p
            className="mt-4 text-sm font-medium"
            style={{ color: 'var(--skin-foreground)' }}
          >
            Aucune notification.
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--skin-muted)' }}>
            Vous serez alerte des qu'un colis evolue.
          </p>
        </div>
      )}
    </motion.section>
  );
}

function EmptyParcels() {
  return (
    <div className="mt-6 text-center py-10">
      <div
        className="mx-auto flex h-14 w-14 items-center justify-center skin-radius-lg"
        style={{
          background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
          color: 'var(--skin-primary)',
        }}
      >
        <Package className="h-6 w-6" />
      </div>
      <p
        className="mt-4 text-sm font-medium"
        style={{ color: 'var(--skin-foreground)' }}
      >
        Aucun colis pour le moment.
      </p>
      <p className="mt-1 text-xs" style={{ color: 'var(--skin-muted)' }}>
        Vos envois apparaitront ici des qu&apos;ils seront enregistres par votre agence.
      </p>
    </div>
  );
}
