'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, Ticket } from 'lucide-react';
import { formatAmount } from '@transitsoftservices/shared';
import type { PublicPromoCode } from '@/lib/api/client';

const CATEGORY_LABELS: Record<string, string> = {
  STANDARD: 'Standard',
  DOCUMENT: 'Documents',
  FOOD: 'Alimentaire',
  ELECTRONICS: 'Electronique',
  CLOTHING: 'Vetements',
  OTHER: 'Autre',
};

const TRANSIT_LABELS: Record<string, string> = {
  AIR: 'Aerien',
  SEA: 'Maritime',
  LAND: 'Terrestre',
};

/** "-15%" ou "-2 000 FCFA" selon le type de remise. */
export function discountLabel(
  promo: Pick<PublicPromoCode, 'discountType' | 'discountValue'>,
  currency: string,
): string {
  const value = Number(promo.discountValue);
  return promo.discountType === 'PERCENT'
    ? `-${value}%`
    : `-${formatAmount(value, currency)}`;
}

/** Conditions lisibles, une puce par contrainte reelle. */
function conditions(promo: PublicPromoCode, currency: string): string[] {
  const out: string[] = [];
  if (promo.minOrderAmount != null) {
    out.push(`A partir de ${formatAmount(Number(promo.minOrderAmount), currency)} de facture`);
  }
  if (promo.maxOrderAmount != null) {
    out.push(`Jusqu'a ${formatAmount(Number(promo.maxOrderAmount), currency)} de facture`);
  }
  if (promo.maxDiscountAmount != null && promo.discountType === 'PERCENT') {
    out.push(`Remise plafonnee a ${formatAmount(Number(promo.maxDiscountAmount), currency)}`);
  }
  if (promo.parcelCategories.length > 0) {
    out.push(
      `Colis : ${promo.parcelCategories.map((c) => CATEGORY_LABELS[c] ?? c).join(', ')}`,
    );
  }
  if (promo.transitTypes.length > 0) {
    out.push(`Transport : ${promo.transitTypes.map((t) => TRANSIT_LABELS[t] ?? t).join(', ')}`);
  }
  if (promo.routes?.length) {
    out.push(`Routes : ${promo.routes.map((r) => r.name).join(', ')}`);
  }
  if (promo.expiresAt) {
    out.push(`Valable jusqu'au ${new Date(promo.expiresAt).toLocaleDateString('fr-FR')}`);
  }
  return out;
}

interface Props {
  promo: PublicPromoCode;
  currency: string;
  /** Index pour l'apparition en cascade. */
  index?: number;
  /** Ligne supplementaire affichee en pied de carte (ex: quota restant). */
  footnote?: string | null;
}

export function PromoCodeCard({ promo, currency, index = 0, footnote }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(promo.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible (contexte non securise) : on laisse le
      // code affiche, il reste selectionnable a la main.
    }
  };

  const lines = conditions(promo, currency);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="flex flex-col gap-4 rounded-2xl border p-5"
      style={{ borderColor: 'var(--skin-border)', background: 'var(--skin-surface)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center skin-radius"
            style={{ background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)' }}
          >
            <Ticket className="h-5 w-5" style={{ color: 'var(--skin-primary)' }} />
          </div>
          <div className="min-w-0">
            <p
              className="truncate text-sm font-semibold"
              style={{ color: 'var(--skin-foreground)' }}
            >
              {promo.label}
            </p>
            {promo.description && (
              <p
                className="mt-0.5 line-clamp-2 text-xs"
                style={{ color: 'var(--skin-muted-foreground)' }}
              >
                {promo.description}
              </p>
            )}
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-sm font-bold"
          style={{
            background: 'color-mix(in oklab, var(--skin-primary) 14%, transparent)',
            color: 'var(--skin-primary)',
          }}
        >
          {discountLabel(promo, currency)}
        </span>
      </div>

      <button
        type="button"
        onClick={copy}
        className="flex items-center justify-between gap-3 border border-dashed px-3 py-2.5 text-left skin-radius"
        style={{ borderColor: 'var(--skin-primary)' }}
      >
        <span
          className="font-mono text-base font-bold tracking-widest"
          style={{ color: 'var(--skin-foreground)' }}
        >
          {promo.code}
        </span>
        <span
          className="inline-flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: 'var(--skin-primary)' }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copie' : 'Copier'}
        </span>
      </button>

      {lines.length > 0 && (
        <ul className="space-y-1 text-xs" style={{ color: 'var(--skin-muted-foreground)' }}>
          {lines.map((c) => (
            <li key={c}>· {c}</li>
          ))}
        </ul>
      )}

      {footnote && (
        <p className="text-xs font-medium" style={{ color: 'var(--skin-primary)' }}>
          {footnote}
        </p>
      )}
    </motion.div>
  );
}
