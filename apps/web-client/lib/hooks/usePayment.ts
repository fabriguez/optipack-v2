'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type {
  CheckoutInput,
  PaymentOrder,
  PaymentStatus,
} from '@transitsoftservices/payments';
import { buildChain } from '@transitsoftservices/payments';
import { portalApi } from '@/lib/api/client';

/** Stable client-side idempotency key generator. */
function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

const TERMINAL: PaymentStatus[] = [
  'SUCCEEDED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED',
];

/**
 * Multi-step checkout : creates the order, then polls for its final status.
 * For mobile money the user typically gets a USSD push and confirms on their
 * phone; the polling watches the order until terminal.
 */
export function useCheckout() {
  const qc = useQueryClient();
  const [orderId, setOrderId] = useState<string | null>(null);
  const idemRef = useRef<string>(makeIdempotencyKey());

  const createMutation = useMutation({
    mutationFn: (input: Omit<CheckoutInput, 'idempotencyKey'>) =>
      portalApi.createCheckout({
        ...input,
        idempotencyKey: idemRef.current,
      } as CheckoutInput),
    onSuccess: ({ order }) => {
      setOrderId(order.id);
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.message || 'Le paiement n\'a pas pu demarrer.',
      );
    },
  });

  const poll = useQuery<PaymentOrder | null>({
    queryKey: ['payment', orderId],
    queryFn: () => (orderId ? portalApi.getPaymentOrder(orderId) : Promise.resolve(null)),
    enabled: !!orderId,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 2_500;
      return TERMINAL.includes(data.status) ? false : 2_500;
    },
  });

  const reset = () => {
    setOrderId(null);
    idemRef.current = makeIdempotencyKey();
    createMutation.reset();
    qc.removeQueries({ queryKey: ['payment'] });
  };

  return {
    createMutation,
    order: poll.data ?? null,
    isPolling: poll.isFetching,
    reset,
  };
}

/**
 * Hook for previewing the fallback chain to the user before confirming.
 * Pure client-side, uses the shared router.
 */
export function usePreviewChain(input: Partial<CheckoutInput>) {
  return useMemo(() => {
    if (!input.kind || !input.amount || !input.currency || !input.reference) {
      return [];
    }
    return buildChain(input as CheckoutInput);
  }, [input.kind, input.amount, input.currency, input.phone, input.preferredProvider, input.reference]);
}

/** Convenience: terminal+success check. */
export function useOnPaymentSuccess(
  order: PaymentOrder | null,
  cb: (order: PaymentOrder) => void,
) {
  const fired = useRef(false);
  useEffect(() => {
    if (!order || fired.current) return;
    if (order.status === 'SUCCEEDED') {
      fired.current = true;
      cb(order);
    }
  }, [order, cb]);
}
