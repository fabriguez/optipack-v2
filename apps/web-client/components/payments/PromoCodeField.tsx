'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Ticket, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatAmount } from '@transitsoftservices/shared';
import { portalApi } from '@/lib/api/client';

interface Props {
  invoiceId: string;
  currency: string;
  /** Remise deja posee sur la facture (0 si aucune). */
  promoDiscount: number;
  promoCodeLabel: string | null;
  /** Appele apres application ou retrait : le parent doit recharger la facture. */
  onChanged: () => void;
}

function errorMessage(e: unknown, fallback: string): string {
  const res = (e as { response?: { data?: { message?: string } } })?.response;
  return res?.data?.message || fallback;
}

/**
 * Saisie d'un code promo dans le tunnel de paiement. La verification est faite
 * en deux temps : "Verifier" simule la remise sans consommer le quota du code,
 * "Appliquer" la pose reellement sur la facture et diminue le solde a payer.
 */
export function PromoCodeField({
  invoiceId,
  currency,
  promoDiscount,
  promoCodeLabel,
  onChanged,
}: Props) {
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<{ ok: boolean; message: string } | null>(null);

  const previewMutation = useMutation({
    mutationFn: () => portalApi.previewPromoCode(invoiceId, code),
    onSuccess: (data) => {
      setPreview(
        data.evaluation.ok
          ? {
              ok: true,
              message: `Remise applicable : ${formatAmount(data.evaluation.discountAmount, currency)}`,
            }
          : { ok: false, message: data.evaluation.message },
      );
    },
    onError: (e) => toast.error(errorMessage(e, 'Verification impossible')),
  });

  const applyMutation = useMutation({
    mutationFn: () => portalApi.applyPromoCode(invoiceId, code),
    onSuccess: () => {
      setCode('');
      setPreview(null);
      onChanged();
      toast.success('Code promo applique');
    },
    onError: (e) => toast.error(errorMessage(e, "Ce code n'a pas pu etre applique")),
  });

  const removeMutation = useMutation({
    mutationFn: () => portalApi.removePromoCode(invoiceId),
    onSuccess: () => {
      onChanged();
      toast.success('Code promo retire');
    },
    onError: (e) => toast.error(errorMessage(e, 'Retrait impossible')),
  });

  if (promoDiscount > 0) {
    return (
      <div
        className="flex items-center justify-between gap-3 p-3 skin-radius"
        style={{ background: 'color-mix(in oklab, var(--skin-primary) 10%, transparent)' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Ticket className="h-4 w-4 shrink-0" style={{ color: 'var(--skin-primary)' }} />
          <div className="min-w-0">
            <p
              className="truncate text-sm font-semibold"
              style={{ color: 'var(--skin-foreground)' }}
            >
              {promoCodeLabel ?? 'Code promo'}
            </p>
            <p className="text-xs" style={{ color: 'var(--skin-primary)' }}>
              -{formatAmount(promoDiscount, currency)} deduits du solde
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => removeMutation.mutate()}
          disabled={removeMutation.isPending}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold disabled:opacity-50"
          style={{ color: 'var(--skin-muted)' }}
        >
          <X className="h-3.5 w-3.5" />
          Retirer
        </button>
      </div>
    );
  }

  const disabled = code.trim().length === 0;

  return (
    <div>
      <label
        className="mb-1 block text-xs font-semibold"
        style={{ color: 'var(--skin-foreground)' }}
      >
        Code promo (facultatif)
      </label>
      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setPreview(null);
          }}
          placeholder="EX : ETE2026"
          className="flex-1 border px-3 py-2 font-mono text-sm tracking-widest outline-none skin-radius"
          style={{
            background: 'var(--skin-background)',
            color: 'var(--skin-foreground)',
            borderColor: 'var(--skin-border)',
          }}
        />
        <button
          type="button"
          onClick={() => previewMutation.mutate()}
          disabled={disabled || previewMutation.isPending}
          className="px-3 py-2 text-xs font-semibold disabled:opacity-50 skin-btn-ghost"
        >
          Verifier
        </button>
        <button
          type="button"
          onClick={() => applyMutation.mutate()}
          disabled={disabled || applyMutation.isPending}
          className="px-3 py-2 text-xs font-semibold disabled:opacity-50 skin-btn-primary"
        >
          Appliquer
        </button>
      </div>
      {preview && (
        <p className="mt-1 text-xs" style={{ color: preview.ok ? '#16a34a' : '#dc2626' }}>
          {preview.message}
        </p>
      )}
    </div>
  );
}
