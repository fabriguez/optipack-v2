import crypto from 'node:crypto';
import type { IPaymentProvider, InitiateInput, InitiateResult, PaymentProviderConfig, PollResult } from '../types';

/**
 * NotchPay (Cameroun) - Mobile Money + Cartes.
 * Doc : https://docs.notchpay.co/
 * Credentials : publicKey, privateKey, webhookSecret.
 *
 * NotchPay couvre MTN MoMo + Orange Money + cartes Visa/Mastercard via une
 * unique integration. Initialisation par creation de payment + redirection
 * vers une page hostee OU declenchement collect direct.
 */
export class NotchPayProvider implements IPaymentProvider {
  readonly name = 'NOTCHPAY';
  readonly channel = 'MOBILE_MONEY' as const;

  private baseUrl(cfg: PaymentProviderConfig): string {
    return cfg.apiBaseUrl ?? 'https://api.notchpay.co';
  }

  async initiate(input: InitiateInput, cfg: PaymentProviderConfig): Promise<InitiateResult> {
    const publicKey = cfg.credentials?.publicKey;
    if (!publicKey) {
      return { status: 'FAILED', errorCode: 'NO_CREDENTIALS', errorMessage: 'NotchPay non configure' };
    }
    try {
      const res = await fetch(`${this.baseUrl(cfg)}/payments/initialize`, {
        method: 'POST',
        headers: {
          Authorization: publicKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(input.amount),
          currency: input.currency || 'XAF',
          email: input.payerEmail ?? 'noreply@transitsoftservices.com',
          phone: input.payerPhone,
          reference: input.externalReference,
          description: input.description,
          callback: input.returnUrl,
          channels: input.payerPhone ? ['mobile_money'] : ['card'],
        }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || data?.status !== 'Accepted') {
        return {
          status: 'FAILED',
          errorCode: `HTTP_${res.status}`,
          errorMessage: data?.message ?? 'NotchPay rejected',
          raw: data,
        };
      }
      return {
        status: data.authorization_url ? 'REDIRECT' : 'AWAITING_USER',
        externalRef: data.transaction?.reference ?? data.reference,
        redirectUrl: data.authorization_url,
        instructions: data.authorization_url ? undefined : 'Validez sur votre telephone.',
        raw: data,
      };
    } catch (err) {
      return { status: 'FAILED', errorCode: 'EXCEPTION', errorMessage: String((err as Error).message ?? err) };
    }
  }

  async poll(externalRef: string, cfg: PaymentProviderConfig): Promise<PollResult> {
    const publicKey = cfg.credentials?.publicKey ?? '';
    if (!publicKey) return { status: 'PENDING' };
    try {
      const res = await fetch(`${this.baseUrl(cfg)}/payments/${externalRef}`, {
        headers: { Authorization: publicKey },
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) return { status: 'PENDING' };
      const status = (data?.transaction?.status ?? '').toLowerCase();
      if (status === 'complete') return { status: 'SUCCEEDED', paidAt: new Date(), raw: data };
      if (status === 'failed' || status === 'canceled') return { status: 'FAILED', raw: data };
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
    const secret = cfg.credentials?.webhookSecret ?? '';
    if (!secret) return false;
    const sig = (headers['x-notch-signature'] as string | undefined) ?? '';
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return sig === expected;
  }

  parseWebhook(body: unknown, _cfg: PaymentProviderConfig): PollResult & { externalRef: string } {
    const b = body as { event?: string; data?: { reference?: string; status?: string } };
    const status = (b?.data?.status ?? '').toLowerCase();
    return {
      externalRef: b?.data?.reference ?? '',
      status: status === 'complete' ? 'SUCCEEDED' : status === 'failed' || status === 'canceled' ? 'FAILED' : 'PENDING',
      paidAt: status === 'complete' ? new Date() : undefined,
      raw: body,
    };
  }
}
