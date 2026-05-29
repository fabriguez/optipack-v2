import crypto from 'node:crypto';
import type { IPaymentProvider, InitiateInput, InitiateResult, PaymentProviderConfig, PollResult } from '../types';

/**
 * Flutterwave - Multi-Africa (Cameroun MTN MoMo + cartes).
 * Doc : https://developer.flutterwave.com/reference
 * Credentials : secretKey, webhookSecret (verif-hash).
 *
 * Pour le canal MOBILE_MONEY au Cameroun : utiliser le endpoint charge
 * type=mobile_money_franco. Pour les cartes : Standard checkout (redirect).
 */
export class FlutterwaveProvider implements IPaymentProvider {
  readonly name = 'FLUTTERWAVE';
  readonly channel = 'MOBILE_MONEY' as const;

  private baseUrl(cfg: PaymentProviderConfig): string {
    return cfg.apiBaseUrl ?? 'https://api.flutterwave.com/v3';
  }

  async initiate(input: InitiateInput, cfg: PaymentProviderConfig): Promise<InitiateResult> {
    const secret = cfg.credentials?.secretKey;
    if (!secret) {
      return { status: 'FAILED', errorCode: 'NO_CREDENTIALS', errorMessage: 'Flutterwave non configure' };
    }
    if (!input.payerPhone) {
      return { status: 'FAILED', errorCode: 'NO_PHONE', errorMessage: 'Numero requis pour MoMo' };
    }
    try {
      const res = await fetch(`${this.baseUrl(cfg)}/charges?type=mobile_money_franco`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone_number: input.payerPhone,
          amount: Math.round(input.amount),
          currency: input.currency || 'XAF',
          email: input.payerEmail ?? 'noreply@transitsoftservices.com',
          tx_ref: input.externalReference,
          country: input.country ?? 'CM',
          redirect_url: input.returnUrl,
          fullname: input.payerName ?? 'Client',
        }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || data?.status !== 'success') {
        return {
          status: 'FAILED',
          errorCode: `HTTP_${res.status}`,
          errorMessage: data?.message ?? 'Flutterwave rejected',
          raw: data,
        };
      }
      return {
        status: 'AWAITING_USER',
        externalRef: String(data?.data?.id ?? ''),
        instructions: data?.meta?.authorization?.note ?? 'Validez sur votre telephone.',
        raw: data,
      };
    } catch (err) {
      return { status: 'FAILED', errorCode: 'EXCEPTION', errorMessage: String((err as Error).message ?? err) };
    }
  }

  async poll(externalRef: string, cfg: PaymentProviderConfig): Promise<PollResult> {
    const secret = cfg.credentials?.secretKey ?? '';
    if (!secret) return { status: 'PENDING' };
    try {
      const res = await fetch(`${this.baseUrl(cfg)}/transactions/${externalRef}/verify`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) return { status: 'PENDING' };
      const status = (data?.data?.status ?? '').toLowerCase();
      if (status === 'successful') return { status: 'SUCCEEDED', paidAt: new Date(), raw: data };
      if (status === 'failed') return { status: 'FAILED', raw: data };
      return { status: 'PENDING', raw: data };
    } catch {
      return { status: 'PENDING' };
    }
  }

  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    _rawBody: Buffer,
    cfg: PaymentProviderConfig,
  ): boolean {
    const expected = cfg.credentials?.webhookSecret ?? '';
    if (!expected) return false;
    // Flutterwave verif-hash header.
    const sig = (headers['verif-hash'] as string | undefined) ?? '';
    if (!sig) return false;
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  }

  parseWebhook(body: unknown, _cfg: PaymentProviderConfig): PollResult & { externalRef: string } {
    const b = body as { event?: string; data?: { id?: number | string; status?: string } };
    const status = (b?.data?.status ?? '').toLowerCase();
    return {
      externalRef: String(b?.data?.id ?? ''),
      status: status === 'successful' ? 'SUCCEEDED' : status === 'failed' ? 'FAILED' : 'PENDING',
      paidAt: status === 'successful' ? new Date() : undefined,
      raw: body,
    };
  }
}
