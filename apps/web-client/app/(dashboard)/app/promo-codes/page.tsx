'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Ticket } from 'lucide-react';
import {
  portalApi,
  type AssignedPromoCode,
  type MyPromoCodes,
  type PublicPromoCode,
} from '@/lib/api/client';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';
import { PromoCodeCard } from '@/components/promo/PromoCodeCard';

/** Un code attribue expose son quota restant ; sinon on n'affiche rien. */
function quotaFootnote(promo: AssignedPromoCode): string | null {
  const { remainingUses } = promo.assignment;
  if (remainingUses == null) return 'Utilisations illimitees';
  if (remainingUses === 0) return 'Quota epuise';
  return `${remainingUses} utilisation${remainingUses > 1 ? 's' : ''} restante${remainingUses > 1 ? 's' : ''}`;
}

/** Un code attribue n'a pas les routes detaillees : on normalise pour la carte. */
function toCardPromo(promo: AssignedPromoCode): PublicPromoCode {
  return { ...promo, routes: [] };
}

export default function MyPromoCodesPage() {
  const { meta } = useTenantMeta();
  const currency = meta?.defaultCurrency ?? 'XAF';

  const { data, isLoading } = useQuery<MyPromoCodes>({
    queryKey: ['portal', 'promo-codes'],
    queryFn: () => portalApi.getMyPromoCodes(),
    refetchOnWindowFocus: true,
  });

  const assigned = data?.assigned ?? [];
  const publicCodes = data?.public ?? [];
  const isEmpty = assigned.length === 0 && publicCodes.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
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
          Mes codes promo
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--skin-muted-foreground)' }}>
          Saisissez un code au moment de payer une facture pour en deduire la remise.
        </p>
      </motion.div>

      {isLoading ? (
        <p className="text-sm" style={{ color: 'var(--skin-muted-foreground)' }}>
          Chargement...
        </p>
      ) : isEmpty ? (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl border p-10 text-center"
          style={{ borderColor: 'var(--skin-border)', background: 'var(--skin-surface)' }}
        >
          <Ticket className="h-8 w-8" style={{ color: 'var(--skin-primary)' }} />
          <p className="text-sm" style={{ color: 'var(--skin-muted-foreground)' }}>
            Aucun code promo disponible pour le moment.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {assigned.length > 0 && (
            <section className="space-y-3">
              <h2
                className="text-sm font-semibold uppercase tracking-wider"
                style={{ color: 'var(--skin-muted-foreground)' }}
              >
                Codes qui vous sont reserves
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {assigned.map((promo, i) => (
                  <PromoCodeCard
                    key={promo.id}
                    promo={toCardPromo(promo)}
                    currency={currency}
                    index={i}
                    footnote={quotaFootnote(promo)}
                  />
                ))}
              </div>
            </section>
          )}

          {publicCodes.length > 0 && (
            <section className="space-y-3">
              <h2
                className="text-sm font-semibold uppercase tracking-wider"
                style={{ color: 'var(--skin-muted-foreground)' }}
              >
                Promotions ouvertes a tous
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {publicCodes.map((promo, i) => (
                  <PromoCodeCard key={promo.id} promo={promo} currency={currency} index={i} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
