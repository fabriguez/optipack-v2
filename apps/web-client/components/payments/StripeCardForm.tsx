'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Lock } from 'lucide-react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { toast } from 'sonner';
import { portalApi } from '@/lib/api/client';

interface Props {
  amount: number;
  currency: string;
  reference: string;
  referenceType: 'PARCEL' | 'INVOICE' | 'TOPUP';
  onSuccess: (orderId: string) => void;
}

/**
 * Server-side Stripe : we fetch a PaymentIntent client_secret from the API.
 * The publishable key is also returned by the API (per-tenant), so the same
 * web-client bundle can serve different tenants on different Stripe accounts.
 */
export function StripeCardForm(props: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    portalApi
      .createStripeIntent({
        amount: props.amount,
        currency: props.currency,
        reference: props.reference,
        referenceType: props.referenceType,
        idempotencyKey:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `idem_${Date.now()}`,
      })
      .then((res) => {
        if (cancelled) return;
        setClientSecret(res.clientSecret);
        setOrderId(res.orderId);
        setStripePromise(loadStripe(res.publishableKey));
      })
      .catch((err: any) => {
        if (cancelled) return;
        setBootError(err?.response?.data?.message || 'Impossible d\'initialiser le paiement.');
      });
    return () => {
      cancelled = true;
    };
  }, [props.amount, props.currency, props.reference, props.referenceType]);

  if (bootError) {
    return (
      <div
        className="p-4 text-sm skin-radius"
        style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626' }}
      >
        {bootError}
      </div>
    );
  }

  if (!clientSecret || !stripePromise) {
    return (
      <div
        className="flex items-center gap-2 p-6 text-sm"
        style={{ color: 'var(--skin-muted)' }}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Initialisation du paiement par carte...
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'flat',
          variables: {
            colorPrimary:
              getComputedStyle(document.documentElement).getPropertyValue(
                '--skin-primary',
              ) || '#1B5E20',
            fontFamily: 'Geist, system-ui, sans-serif',
          },
        },
      }}
    >
      <Inner orderId={orderId!} onSuccess={props.onSuccess} />
    </Elements>
  );
}

function Inner({
  orderId,
  onSuccess,
}: {
  orderId: string;
  onSuccess: (id: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: 'if_required',
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message || 'Le paiement a echoue.');
      return;
    }
    if (paymentIntent?.status === 'succeeded') {
      toast.success('Paiement par carte valide.');
      onSuccess(orderId);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !stripe}
        className="inline-flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold skin-btn-primary"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Lock className="h-4 w-4" />
            Payer par carte
          </>
        )}
      </button>
      <p
        className="text-center text-[11px]"
        style={{ color: 'var(--skin-muted)' }}
      >
        Securise par Stripe - 3D Secure active. Nous ne stockons jamais votre numero de carte.
      </p>
    </motion.div>
  );
}
