'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Handshake, Plane, Ship, Truck, TrendingDown } from 'lucide-react';
import { formatAmount } from '@transitsoftservices/shared';
import { portalApi, type MyTariff } from '@/lib/api/client';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';

const TYPE_META: Record<MyTariff['route']['type'], { label: string; Icon: typeof Plane }> = {
  AIR: { label: 'Aerien', Icon: Plane },
  SEA: { label: 'Maritime', Icon: Ship },
  LAND: { label: 'Terrestre', Icon: Truck },
};

export default function TarifsPage() {
  const { meta } = useTenantMeta();
  const currency = meta?.defaultCurrency ?? 'XAF';

  const { data: tariffs, isLoading } = useQuery<MyTariff[]>({
    queryKey: ['portal', 'tariffs'],
    queryFn: () => portalApi.getMyTariffs(),
    // Pas de socket cote web-client : on rafraichit au focus et periodiquement.
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Link
          href="/app/profile"
          className="inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: 'var(--skin-primary)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au profil
        </Link>
        <h1
          className="mt-3 text-3xl font-bold tracking-tight skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          Mes tarifs
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--skin-muted-foreground)' }}>
          Tarifs partenaire negocies sur vos routes de transit.
        </p>
      </motion.div>

      {isLoading ? (
        <p className="text-sm" style={{ color: 'var(--skin-muted-foreground)' }}>
          Chargement...
        </p>
      ) : !tariffs || tariffs.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl border p-10 text-center"
          style={{ borderColor: 'var(--skin-border)', background: 'var(--skin-surface)' }}
        >
          <Handshake className="h-8 w-8" style={{ color: 'var(--skin-primary)' }} />
          <p className="text-sm" style={{ color: 'var(--skin-muted-foreground)' }}>
            Aucun tarif partenaire dedie pour le moment.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tariffs.map((t, i) => {
            const tm = TYPE_META[t.route.type];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-2xl border p-4"
                style={{ borderColor: 'var(--skin-border)', background: 'var(--skin-surface)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center skin-radius"
                      style={{ background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)' }}
                    >
                      <tm.Icon className="h-5 w-5" style={{ color: 'var(--skin-primary)' }} />
                    </div>
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-semibold"
                        style={{ color: 'var(--skin-foreground)' }}
                      >
                        {t.route.name}
                      </p>
                      <p className="truncate text-xs" style={{ color: 'var(--skin-muted-foreground)' }}>
                        {tm.label} · {t.route.departureCity} → {t.route.arrivalCity}
                      </p>
                    </div>
                  </div>
                  {t.isAdvantage && (
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold"
                      style={{ background: 'color-mix(in oklab, var(--skin-primary) 14%, transparent)', color: 'var(--skin-primary)' }}
                    >
                      <TrendingDown className="h-3 w-3" />-{t.savingsPercent}%
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-xl font-bold" style={{ color: 'var(--skin-foreground)' }}>
                    {formatAmount(t.partnerPrice, currency)}
                    <span className="text-xs font-normal" style={{ color: 'var(--skin-muted-foreground)' }}>
                      {' '}/{t.unit}
                    </span>
                  </span>
                  {t.isAdvantage && t.standardPrice > 0 && (
                    <span
                      className="text-sm line-through"
                      style={{ color: 'var(--skin-muted-foreground)' }}
                    >
                      {formatAmount(t.standardPrice, currency)}/{t.unit}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
