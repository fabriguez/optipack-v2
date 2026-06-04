'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Search, Package, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { portalApi } from '@/lib/api/client';
import { parcelStatusLabel, parcelStatusContextLabel, type ParcelStatusContextLike } from '@/lib/labels';

interface Parcel extends ParcelStatusContextLike {
  id: string;
  trackingNumber: string;
  designation: string;
  status: string;
  weight?: number;
  destination?: string;
  recipient?: { fullName?: string } | null;
  createdAt: string;
}

interface ParcelsResponse {
  data: Parcel[];
  meta?: { total: number; page: number; pageSize: number };
}

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: 'rgba(234,179,8,0.15)', fg: '#ca8a04' },
  IN_TRANSIT: { bg: 'rgba(59,130,246,0.15)', fg: '#2563eb' },
  DELIVERED: { bg: 'rgba(34,197,94,0.15)', fg: '#16a34a' },
  RETURNED: { bg: 'rgba(244,63,94,0.12)', fg: '#e11d48' },
};

export default function ParcelsPage() {
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, isLoading } = useQuery<ParcelsResponse>({
    queryKey: ['portal', 'parcels', search, from, to],
    queryFn: () =>
      portalApi.getParcels({
        search: search || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const items = data?.data ?? [];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1
            className="text-3xl font-bold tracking-tight skin-font-heading"
            style={{ color: 'var(--skin-foreground)' }}
          >
            Mes colis
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: 'var(--skin-muted)' }}
          >
            Retrouvez l'historique et l'etat de tous vos envois.
          </p>
        </div>
      </motion.div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-55 flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: 'var(--skin-muted)' }}
          />
          <input
            type="search"
            placeholder="Rechercher par numero, destinataire..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="skin-input pl-10"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--skin-muted)' }}>
            Du
          </label>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="skin-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--skin-muted)' }}>
            Au
          </label>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="skin-input"
          />
        </div>
        {(from || to) && (
          <button
            type="button"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
            className="px-3 py-2 text-sm font-medium skin-btn-ghost"
          >
            Reinitialiser
          </button>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="overflow-hidden skin-card"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2
              className="h-6 w-6 animate-spin"
              style={{ color: 'var(--skin-primary)' }}
            />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <Package
              className="mx-auto h-10 w-10"
              style={{ color: 'var(--skin-muted)' }}
            />
            <p
              className="mt-3 text-sm font-medium"
              style={{ color: 'var(--skin-foreground)' }}
            >
              Aucun colis trouve.
            </p>
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--skin-border)' }}>
            {items.map((p) => {
              const tone = STATUS_TONE[p.status] ?? {
                bg: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
                fg: 'var(--skin-primary)',
              };
              return (
                <li key={p.id}>
                  <Link
                    href={`/app/parcels/${p.trackingNumber}`}
                    className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-black/[0.02]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className="truncate text-sm font-semibold skin-font-heading"
                          style={{ color: 'var(--skin-foreground)' }}
                        >
                          {p.designation || 'Colis sans description'}
                        </p>
                      </div>
                      <p
                        className="mt-0.5 text-xs"
                        style={{ color: 'var(--skin-muted)' }}
                      >
                        #{p.trackingNumber} -{' '}
                        {p.recipient?.fullName ?? 'Destinataire ?'}{' '}
                        {p.destination ? `- ${p.destination}` : ''}
                      </p>
                      {(p.status === 'IN_TRANSIT' || p.status === 'ARRIVED') && (
                        <p
                          className="mt-0.5 truncate text-xs font-medium"
                          style={{ color: 'var(--skin-primary)' }}
                        >
                          {parcelStatusContextLabel(p)}
                        </p>
                      )}
                    </div>
                    <span
                      className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide skin-radius-sm"
                      style={{ background: tone.bg, color: tone.fg }}
                    >
                      {parcelStatusLabel(p.status)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </motion.div>
    </div>
  );
}
