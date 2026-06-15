'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useCheckout, usePreviewChain } from '@/lib/hooks/usePayment';
import { ProviderBadge } from './ProviderBadge';
import { PaymentStatusView } from './PaymentStatusView';
import { Field } from '@/components/auth/Field';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';

interface Props {
  /** Solde max (pour affichage fallback chain). */
  amount: number;
  /** Montant effectivement a debiter (acompte ou total). Defaut = amount. */
  payAmount?: number;
  currency: string;
  reference: string;
  referenceType: 'PARCEL' | 'INVOICE' | 'TOPUP';
  customer: { fullName: string; phone?: string; email?: string };
  onSuccess: (orderId: string) => void;
}

export function MobileMoneyForm(props: Props) {
  const [phone, setPhone] = useState(props.customer.phone ?? '');
  const [preferred, setPreferred] = useState<string | undefined>();
  const { createMutation, order, reset } = useCheckout();
  const payAmount = props.payAmount ?? props.amount;

  const chain = usePreviewChain({
    kind: 'mobile_money',
    amount: payAmount,
    currency: props.currency,
    phone,
    preferredProvider: preferred,
    reference: props.reference,
    referenceType: props.referenceType,
    customer: props.customer,
  });

  // Auto-fire onSuccess when order reaches SUCCEEDED
  if (order?.status === 'SUCCEEDED') props.onSuccess(order.id);

  const submit = () => {
    if (!phone) return;
    createMutation.mutate(
      {
        kind: 'mobile_money',
        amount: payAmount,
        currency: props.currency,
        phone,
        preferredProvider: preferred,
        reference: props.reference,
        referenceType: props.referenceType,
        customer: { ...props.customer, phone },
      },
      {
        onSuccess: (data: any) => {
          if (data?.attempt?.next?.type === 'redirect') {
            window.open(data.attempt.next.url, '_blank');
          }
        },
      },
    );
  };

  if (order) {
    return (
      <PaymentStatusView
        order={order}
        onRetry={() => {
          reset();
          setPreferred(undefined);
        }}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <Field
        label="Numero mobile money"
        hint="L'agregateur sera choisi automatiquement selon l'operateur."
      >
        <AppPhoneInput
          value={phone}
          onChange={(v) => setPhone(v ?? '')}
          placeholder="+237 6XX XXX XXX"
        />
      </Field>

      {chain.length > 0 && (
        <div>
          <p
            className="mb-2 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: 'var(--skin-muted)' }}
          >
            Chaine de fallback ({chain.length})
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {chain.map((cap, i) => (
              <button
                type="button"
                key={cap.id}
                onClick={() => setPreferred(cap.id === preferred ? undefined : cap.id)}
                className="text-left"
              >
                <div
                  className="transition-all"
                  style={{
                    outline:
                      preferred === cap.id
                        ? '2px solid var(--skin-primary)'
                        : '2px solid transparent',
                    borderRadius: 'var(--skin-radius-sm)',
                  }}
                >
                  <ProviderBadge cap={cap} index={i} />
                </div>
              </button>
            ))}
          </div>
          <p
            className="mt-2 text-[11px]"
            style={{ color: 'var(--skin-muted)' }}
          >
            Si le premier essai echoue, on bascule automatiquement vers le suivant.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!phone || createMutation.isPending}
        className="inline-flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold skin-btn-primary"
      >
        {createMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Payer {payAmount.toLocaleString('fr-FR')} {props.currency}
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </motion.div>
  );
}
