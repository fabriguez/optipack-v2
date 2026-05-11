'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  ArrowRight,
  PlusCircle,
} from 'lucide-react';
import { portalApi } from '@/lib/api/client';

interface DashboardData {
  stats: {
    totalParcels: number;
    inTransit: number;
    delivered: number;
    pending: number;
  };
  recentParcels?: Array<{
    id: string;
    trackingNumber: string;
    description: string;
    status: string;
    createdAt: string;
  }>;
}

const FALLBACK: DashboardData = {
  stats: { totalParcels: 0, inTransit: 0, delivered: 0, pending: 0 },
  recentParcels: [],
};

const STATS_CARDS = [
  { key: 'totalParcels', label: 'Tous vos colis', Icon: Package, hue: 'primary' },
  { key: 'inTransit', label: 'En transit', Icon: Truck, hue: 'info' },
  { key: 'delivered', label: 'Livres', Icon: CheckCircle2, hue: 'success' },
  { key: 'pending', label: 'En attente', Icon: Clock, hue: 'warning' },
] as const;

export default function DashboardHome() {
  const { data = FALLBACK, isLoading } = useQuery<DashboardData>({
    queryKey: ['portal', 'dashboard'],
    queryFn: () => portalApi.getDashboard(),
  });

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
            Bonjour, content de vous revoir.
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: 'var(--skin-muted)' }}
          >
            Voici un apercu de vos envois en cours.
          </p>
        </div>
        <Link
          href="/app/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold skin-btn-primary"
        >
          <PlusCircle className="h-4 w-4" />
          Nouvel envoi
        </Link>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS_CARDS.map((card, i) => {
          const value = (data.stats?.[card.key] as number | undefined) ?? 0;
          return (
            <motion.div
              key={card.key}
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
                className="mt-4 text-3xl font-bold tracking-tight skin-font-heading"
                style={{ color: 'var(--skin-foreground)' }}
              >
                {isLoading ? '-' : value}
              </div>
              <p
                className="mt-0.5 text-sm font-medium"
                style={{ color: 'var(--skin-muted)' }}
              >
                {card.label}
              </p>
            </motion.div>
          );
        })}
      </div>

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

        {data.recentParcels && data.recentParcels.length > 0 ? (
          <ul className="mt-4 divide-y" style={{ borderColor: 'var(--skin-border)' }}>
            {data.recentParcels.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between py-3"
              >
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-semibold"
                    style={{ color: 'var(--skin-foreground)' }}
                  >
                    {p.description || p.trackingNumber}
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
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState />
        )}
      </motion.section>
    </div>
  );
}

function EmptyState() {
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
        Declarez votre premier envoi en moins d'une minute.
      </p>
      <Link
        href="/app/new"
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold skin-btn-primary"
      >
        <PlusCircle className="h-4 w-4" />
        Nouvel envoi
      </Link>
    </div>
  );
}
