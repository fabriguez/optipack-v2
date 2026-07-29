'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Ticket } from 'lucide-react';
import { portalApi, type PublicPromoCode } from '@/lib/api/client';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';
import { PromoCodeCard } from '@/components/promo/PromoCodeCard';

export default function PromotionsPage() {
  const { meta } = useTenantMeta();
  const currency = meta?.defaultCurrency ?? 'XAF';

  const { data: promos, isLoading } = useQuery<PublicPromoCode[]>({
    queryKey: ['public', 'promo-codes'],
    queryFn: () => portalApi.getPublicPromoCodes(),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-2xl text-center"
      >
        <p
          className="text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ color: 'var(--skin-primary)' }}
        >
          Promotions
        </p>
        <h1
          className="mt-3 text-4xl font-bold tracking-tight skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          Codes promo en cours
        </h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--skin-muted-foreground)' }}>
          Saisissez le code au moment de payer votre facture pour en deduire la remise.
        </p>
      </motion.header>

      <div className="mt-12">
        {isLoading ? (
          <p className="text-center text-sm" style={{ color: 'var(--skin-muted-foreground)' }}>
            Chargement...
          </p>
        ) : !promos || promos.length === 0 ? (
          <div
            className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border p-10 text-center"
            style={{ borderColor: 'var(--skin-border)', background: 'var(--skin-surface)' }}
          >
            <Ticket className="h-8 w-8" style={{ color: 'var(--skin-primary)' }} />
            <p className="text-sm" style={{ color: 'var(--skin-muted-foreground)' }}>
              Aucune promotion en cours pour le moment. Revenez bientot.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {promos.map((promo, i) => (
              <PromoCodeCard
                key={promo.id}
                promo={promo}
                currency={currency}
                index={i}
                footnote={
                  promo.isLimited && promo.remainingUses != null
                    ? `Plus que ${promo.remainingUses} utilisation${promo.remainingUses > 1 ? 's' : ''}`
                    : null
                }
              />
            ))}
          </div>
        )}
      </div>

      <p className="mt-12 text-center text-sm" style={{ color: 'var(--skin-muted-foreground)' }}>
        Certains codes sont reserves a des clients precis.{' '}
        <Link
          href="/app/promo-codes"
          className="font-semibold underline"
          style={{ color: 'var(--skin-primary)' }}
        >
          Consultez vos codes personnels
        </Link>{' '}
        depuis votre espace client.
      </p>
    </div>
  );
}
