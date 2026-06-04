'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Gift, Handshake, Sparkles, Clock } from 'lucide-react';
import { portalApi, type ClientProfile } from '@/lib/api/client';

const TIER_LABEL: Record<string, string> = {
  STANDARD: 'Standard',
  SILVER: 'Argent',
  GOLD: 'Or',
  VIP: 'VIP',
};

export default function LoyaltyPage() {
  const { data: me } = useQuery<ClientProfile>({
    queryKey: ['portal', 'me'],
    queryFn: () => portalApi.getMe(),
  });

  const tierLabel = TIER_LABEL[me?.loyaltyTier ?? 'STANDARD'] ?? me?.loyaltyTier;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
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
          Fidelite
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--skin-muted)' }}>
          Vos points et la conversion de vos avantages.
        </p>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 skin-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p
              className="text-4xl font-bold tracking-tight skin-font-heading"
              style={{ color: 'var(--skin-foreground)' }}
            >
              {me?.loyaltyPoints ?? 0}
            </p>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--skin-muted)' }}>
              Points de fidelite cumules
            </p>
          </div>
          <div
            className="flex h-12 w-12 items-center justify-center skin-radius-lg"
            style={{
              background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
              color: 'var(--skin-primary)',
            }}
          >
            <Gift className="h-6 w-6" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold skin-radius-sm"
            style={{
              background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
              color: 'var(--skin-primary)',
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Palier {tierLabel}
          </span>
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold skin-radius-sm"
            style={{
              background: me?.isPartner
                ? 'color-mix(in oklab, var(--skin-primary) 12%, transparent)'
                : 'color-mix(in oklab, var(--skin-muted) 12%, transparent)',
              color: me?.isPartner ? 'var(--skin-primary)' : 'var(--skin-muted)',
            }}
          >
            <Handshake className="h-3.5 w-3.5" />
            {me?.isPartner ? 'Partenaire' : 'Non partenaire'}
          </span>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="p-6 skin-card text-center"
      >
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center skin-radius-lg"
          style={{
            background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
            color: 'var(--skin-primary)',
          }}
        >
          <Clock className="h-6 w-6" />
        </div>
        <h2
          className="mt-4 text-lg font-semibold skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          Conversion bientot disponible
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: 'var(--skin-muted)' }}>
          La conversion de vos points de fidelite en avantages arrive prochainement.
          Continuez a cumuler des points a chaque envoi.
        </p>
      </motion.section>
    </div>
  );
}
