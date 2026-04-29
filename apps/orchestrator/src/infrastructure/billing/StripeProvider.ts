import { injectable } from 'tsyringe';
import { logger } from '../logger';

/**
 * Provider Stripe — wrapper minimaliste autour de l'API Stripe.
 * Pour eviter d'ajouter la dep `stripe` dans cette phase, on appelle l'API HTTP
 * directement (Stripe accepte les form-encoded). Quand on aura besoin de fonctionnalites
 * avancees (subscriptions natives, prorated invoicing), on switchera vers le SDK officiel.
 *
 * Endpoints utilises :
 *  - POST https://api.stripe.com/v1/checkout/sessions  -> creer une session de paiement
 *  - Webhook signe via STRIPE_WEBHOOK_SECRET (verification HMAC SHA-256)
 */

interface CreateCheckoutInput {
  amount: number; // en centimes (Stripe demande des integers)
  currency: string; // "xaf" non supporte directement par Stripe ; utiliser "eur" en SaaS international
  successUrl: string;
  cancelUrl: string;
  customerEmail: string;
  metadata: Record<string, string>;
  productName: string;
}

interface CheckoutResult {
  sessionId: string;
  checkoutUrl: string;
}

@injectable()
export class StripeProvider {
  private readonly secretKey = process.env.STRIPE_SECRET_KEY ?? '';
  private readonly apiBase = 'https://api.stripe.com/v1';

  isConfigured(): boolean {
    return !!this.secretKey;
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutResult> {
    if (!this.isConfigured()) {
      throw new Error('STRIPE_SECRET_KEY non configure');
    }

    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', input.successUrl);
    params.append('cancel_url', input.cancelUrl);
    params.append('customer_email', input.customerEmail);
    params.append('line_items[0][price_data][currency]', input.currency.toLowerCase());
    params.append('line_items[0][price_data][product_data][name]', input.productName);
    params.append('line_items[0][price_data][unit_amount]', String(Math.round(input.amount)));
    params.append('line_items[0][quantity]', '1');
    for (const [k, v] of Object.entries(input.metadata)) {
      params.append(`metadata[${k}]`, v);
    }

    const res = await fetch(`${this.apiBase}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const txt = await res.text();
      logger.error({ status: res.status, body: txt }, '[stripe] checkout failed');
      throw new Error(`Stripe checkout failed: ${res.status}`);
    }
    const data = (await res.json()) as { id: string; url: string };
    return { sessionId: data.id, checkoutUrl: data.url };
  }

  /**
   * Verifie la signature d'un webhook Stripe.
   * En-tete `Stripe-Signature` : `t=<ts>,v1=<sig>`. Calcul : HMAC-SHA256("t.<rawBody>", whsec).
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
    if (!secret) return false;
    const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, p) => {
      const [k, v] = p.split('=');
      if (k && v) acc[k] = v;
      return acc;
    }, {});
    const ts = parts.t;
    const v1 = parts.v1;
    if (!ts || !v1) return false;

    // Tolerance 5 min
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(ts)) > 300) return false;

    const crypto = require('crypto') as typeof import('crypto');
    const expected = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  }
}
