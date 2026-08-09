'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ticket, X } from 'lucide-react';
import { toast } from 'sonner';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { Can } from '@/lib/components/Can';
import { ClientPromoCodePicker } from '@/components/promo/ClientPromoCodePicker';
import { invoicePromoApi } from '@/lib/api/promoCodes';
import { extractApiError } from '@/lib/api/errorMessage';
import { formatAmount } from '@transitsoftservices/shared';

interface Props {
  invoiceId: string;
  /** Remise promo deja posee sur la facture (0 si aucune). */
  promoDiscount: number;
  promoCodeLabel: string | null;
  /** Facture soldee ou annulee : plus aucune action possible. */
  disabled?: boolean;
}

/**
 * Saisie d'un code promo au guichet, au nom du client. La simulation affiche la
 * remise avant de l'appliquer, pour que l'agent puisse l'annoncer sans engager
 * le quota du code.
 */
export function InvoicePromoCodePanel({
  invoiceId,
  promoDiscount,
  promoCodeLabel,
  disabled,
}: Props) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<{ ok: boolean; message: string } | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['invoices', invoiceId] });

  const previewMutation = useMutation({
    mutationFn: () => invoicePromoApi.preview(invoiceId, code),
    onSuccess: (res: { data?: { evaluation?: { ok: boolean; message?: string; discountAmount?: number } } }) => {
      const ev = res?.data?.evaluation;
      if (!ev) return;
      setPreview(
        ev.ok
          ? { ok: true, message: `Remise applicable : ${formatAmount(Number(ev.discountAmount ?? 0))}` }
          : { ok: false, message: ev.message ?? 'Code non applicable.' },
      );
    },
    onError: (e) => toast.error(extractApiError(e, 'Verification impossible')),
  });

  const applyMutation = useMutation({
    mutationFn: () => invoicePromoApi.apply(invoiceId, code),
    onSuccess: () => {
      setCode('');
      setPreview(null);
      refresh();
      toast.success('Code promo applique');
    },
    onError: (e) => toast.error(extractApiError(e, "Ce code n'a pas pu etre applique")),
  });

  const removeMutation = useMutation({
    mutationFn: () => invoicePromoApi.remove(invoiceId),
    onSuccess: () => {
      refresh();
      toast.success('Code promo retire');
    },
    onError: (e) => toast.error(extractApiError(e, 'Retrait impossible')),
  });

  if (promoDiscount > 0) {
    return (
      <AppCard>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Ticket className="h-5 w-5 text-primary-600" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                {promoCodeLabel ?? 'Code promo applique'}
              </p>
              <p className="text-xs text-gray-500">
                Remise deduite du montant a payer.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AppBadge variant="success">-{formatAmount(promoDiscount)}</AppBadge>
            <Can permission="promocode.apply">
              <AppButton
                variant="ghost"
                size="sm"
                disabled={disabled}
                loading={removeMutation.isPending}
                onClick={() => removeMutation.mutate()}
              >
                <X className="h-4 w-4" />
                Retirer
              </AppButton>
            </Can>
          </div>
        </div>
      </AppCard>
    );
  }

  return (
    <Can permission="promocode.apply">
      <AppCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <AppInput
              label="Code promo"
              placeholder="Saisir le code du client"
              value={code}
              disabled={disabled}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setPreview(null);
              }}
            />
          </div>
          <div className="flex gap-2">
            <AppButton
              variant="outline"
              disabled={disabled || code.trim().length === 0}
              loading={previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              Verifier
            </AppButton>
            <AppButton
              disabled={disabled || code.trim().length === 0}
              loading={applyMutation.isPending}
              onClick={() => applyMutation.mutate()}
            >
              Appliquer
            </AppButton>
          </div>
        </div>
        {preview && (
          <p
            className={`mt-2 text-sm ${preview.ok ? 'text-emerald-700' : 'text-red-700'}`}
          >
            {preview.message}
          </p>
        )}

        {/* Codes deja detenus par le client : evite a l'agent de les demander. */}
        {!disabled && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <ClientPromoCodePicker invoiceId={invoiceId} onApplied={refresh} />
          </div>
        )}
      </AppCard>
    </Can>
  );
}
