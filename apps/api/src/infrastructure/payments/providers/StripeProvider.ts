import crypto from 'node:crypto';
import type { IPaymentProvider, InitiateInput, InitiateResult, PaymentProviderConfig, PollResult } from '../types';

/**
 * Stripe (Carte). Utilise Stripe Checkout Sessions (redirection hostee).
 * Credentials attendus :
 *   - secretKey
 *   - webhookSecret
 */
export class StripeProvider implements IPaymentProvider {
  readonly name = 'STRIPE';
  readonly channel = 'CARD' as const;

  async initiate(input: InitiateInput, cfg: PaymentProviderConfig): Promise<InitiateResult> {
    const secret = cfg.credentials?.secretKey;
    if (!secret) {
      return { status: 'FAILED', errorCode: 'NO_CREDENTIALS', errorMessage: 'Stripe non configure' };
    }
    try {
      const body = new URLSearchParams();
      body.set('mode', 'payment');
      body.set('success_url', `${input.returnUrl ?? input.webhookUrl}?intent=${input.intentId}&status=succeeded`);
      body.set('cancel_url', `${input.returnUrl ?? input.webhookUrl}?intent=${input.intentId}&status=cancelled`);
      body.set('client_reference_id', input.intentId);
      body.set('line_items[0][quantity]', '1');
      body.set('line_items[0][price_data][currency]', (input.currency || 'XAF').toLowerCase());
      // Stripe : montant en plus petite unite. XAF zero-decimal -> *1.
      body.set('line_items[0][price_data][unit_amount]', String(Math.round(input.amount)));
      body.set('line_items[0][price_data][product_data][name]', input.description ?? `Facture ${input.externalReference}`);
      if (input.payerEmail) body.set('customer_email', input.payerEmail);
      body.set('metadata[intentId]', input.intentId);
      body.set('metadata[externalReference]', input.externalReference);

      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
      const data = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
      if (!res.ok || !data.url) {
        return { status: 'FAILED', errorCode: 'STRIPE_REJECTED', errorMessage: data.error?.message ?? 'Stripe rejected' };
      }
      return { status: 'REDIRECT', externalRef: data.id, redirectUrl: data.url };
    } catch (err) {
      return { status: 'FAILED', errorCode: 'EXCEPTION', errorMessage: String((err as Error).message ?? err) };
    }
  }

  async poll(externalRef: string, cfg: PaymentProviderConfig): Promise<PollResult> {
    const secret = cfg.credentials?.secretKey ?? '';
    if (!secret) return { status: 'PENDING' };
    try {
      const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${externalRef}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = (await res.json()) as { payment_status?: string };
      if (data.payment_status === 'paid') return { status: 'SUCCEEDED', paidAt: new Date(), raw: data };
      if (data.payment_status === 'unpaid') return { status: 'PENDING', raw: data };
      return { status: 'PENDING', raw: data };
    } catch {
      return { status: 'PENDING' };
    }
  }

  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
    cfg: PaymentProviderConfig,
  ): boolean {
    const secret = cfg.credentials?.webhookSecret;
    if (!secret) return false;
    const sigHeader = (headers['stripe-signature'] as string | undefined) ?? '';
    if (!sigHeader) return false;
    // Format Stripe : "t=1234,v1=hash". On extrait timestamp + signature v1.
    const parts = sigHeader.split(',').reduce<Record<string, string>>((acc, p) => {
      const [k, v] = p.split('=');
      if (k && v) acc[k] = v;
      return acc;
    }, {});
    const t = parts.t;
    const v1 = parts.v1;
    if (!t || !v1) return false;
    const payload = `${t}.${rawBody.toString('utf8')}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    // Comparaison timing-safe.
    if (expected.length !== v1.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  }

  parseWebhook(body: unknown, _cfg: PaymentProviderConfig): PollResult & { externalRef: string } {
    const b = body as { type?: string; data?: { object?: { id?: string; payment_status?: string; client_reference_id?: string } } };
    const obj = b?.data?.object;
    const isPaid = b?.type === 'checkout.session.completed' && obj?.payment_status === 'paid';
    return {
      externalRef: obj?.id ?? '',
      status: isPaid ? 'SUCCEEDED' : b?.type?.includes('failed') ? 'FAILED' : 'PENDING',
      paidAt: isPaid ? new Date() : undefined,
      raw: body,
    };
  }
}
