'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, PackageCheck } from 'lucide-react';
import { CheckoutPanel } from '@/components/payments/CheckoutPanel';

export default function CheckoutPage() {
  const { reference } = useParams<{ reference: string }>();
  const search = useSearchParams();
  const router = useRouter();

  const amount = Number(search.get('amount') ?? '0');
  const currency = search.get('currency') ?? 'XAF';
  const referenceType = (search.get('type') as 'PARCEL' | 'INVOICE' | 'TOPUP') ?? 'PARCEL';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.button
        type="button"
        onClick={() => router.back()}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="inline-flex items-center gap-1.5 text-sm font-semibold"
        style={{ color: 'var(--skin-muted)' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Retour
      </motion.button>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p
          className="text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ color: 'var(--skin-primary)' }}
        >
          Reglement
        </p>
        <h1
          className="mt-1 text-3xl font-bold tracking-tight skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          Encaissez votre envoi.
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--skin-muted)' }}>
          Mobile money en priorite, carte en backup. Nous testons
          automatiquement la chaine de fallback si necessaire.
        </p>
      </motion.div>

      <CheckoutPanel
        amount={amount}
        currency={currency}
        reference={reference}
        referenceType={referenceType}
        customer={{ fullName: '' }}
        onSuccess={() => router.replace('/app/parcels?paid=1')}
      />

      <div
        className="flex items-start gap-3 p-4 skin-radius-sm"
        style={{
          background: 'color-mix(in oklab, var(--skin-primary) 8%, transparent)',
        }}
      >
        <PackageCheck
          className="mt-0.5 h-5 w-5"
          style={{ color: 'var(--skin-primary)' }}
        />
        <p className="text-sm" style={{ color: 'var(--skin-foreground)' }}>
          Une fois le paiement valide, votre colis passe automatiquement en{' '}
          <b>PRET A ENLEVER</b> et notre coursier est notifie.
        </p>
      </div>
    </div>
  );
}
