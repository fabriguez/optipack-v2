import crypto from 'node:crypto';
import type { IPaymentProvider, InitiateInput, InitiateResult, PaymentProviderConfig, PollResult } from '../types';

/**
 * Campay (Cameroun) - Mobile Money MTN/Orange.
 * Doc : https://documenter.getpostman.com/view/2391374/T1LV8PVA
 *
 * Credentials attendus dans config.credentials :
 *   - apiUsername
 *   - apiPassword
 *   - webhookSecret (HMAC pour verifier webhook)
 */
export class CampayProvider implements IPaymentProvider {
  readonly name = 'CAMPAY';
  readonly channel = 'MOBILE_MONEY' as const;

  private baseUrl(cfg: PaymentProviderConfig): string {
    return cfg.apiBaseUrl ?? 'https://demo.campay.net/api';
  }

  private async getToken(cfg: PaymentProviderConfig): Promise<string> {
    const res = await fetch(`${this.baseUrl(cfg)}/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cfg.credentials?.apiUsername,
        password: cfg.credentials?.apiPassword,
      }),
    });
    if (!res.ok) throw new Error(`Campay token HTTP ${res.status}`);
    const data = (await res.json()) as { token?: string };
    if (!data.token) throw new Error('Campay token missing');
    return data.token;
  }

  async initiate(input: InitiateInput, cfg: PaymentProviderConfig): Promise<InitiateResult> {
    if (!cfg.credentials?.apiUsername || !cfg.credentials?.apiPassword) {
      return { status: 'FAILED', errorCode: 'NO_CREDENTIALS', errorMessage: 'Campay non configure' };
    }
    if (!input.payerPhone) {
      return { status: 'FAILED', errorCode: 'NO_PHONE', errorMessage: 'Numero MoMo requis' };
    }
    try {
      const token = await this.getToken(cfg);
      const res = await fetch(`${this.baseUrl(cfg)}/collect/`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: String(Math.round(input.amount)),
          currency: input.currency || 'XAF',
          from: input.payerPhone.replace(/[^0-9]/g, ''),
          description: input.description ?? `Paiement ${input.externalReference}`,
          external_reference: input.externalReference,
        }),
      });
      const body = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        return { status: 'FAILED', errorCode: `HTTP_${res.status}`, errorMessage: body?.message ?? 'Campay rejected', raw: body };
      }
      return {
        status: 'AWAITING_USER',
        externalRef: body?.reference,
        instructions: 'Confirmez sur votre telephone (notification MoMo).',
        raw: body,
      };
    } catch (err) {
      return { status: 'FAILED', errorCode: 'EXCEPTION', errorMessage: String((err as Error).message ?? err) };
    }
  }

  async poll(externalRef: string, cfg: PaymentProviderConfig): Promise<PollResult> {
    try {
      const token = await this.getToken(cfg);
      const res = await fetch(`${this.baseUrl(cfg)}/transaction/${externalRef}/`, {
        headers: { Authorization: `Token ${token}` },
      });
      if (!res.ok) {
        return { status: 'PENDING', errorMessage: `HTTP ${res.status}` };
      }
      const body = (await res.json()) as { status?: string; operator_reference?: string };
      switch ((body.status ?? '').toUpperCase()) {
        case 'SUCCESSFUL':
          return { status: 'SUCCEEDED', paidAt: new Date(), raw: body };
        case 'FAILED':
          return { status: 'FAILED', errorMessage: 'Refuse par operateur', raw: body };
        default:
          return { status: 'PENDING', raw: body };
      }
    } catch (err) {
      return { status: 'PENDING', errorMessage: String((err as Error).message ?? err) };
    }
  }

  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
    cfg: PaymentProviderConfig,
  ): boolean {
    const secret = cfg.credentials?.webhookSecret ?? '';
    if (!secret) return false;
    const sig = (headers['x-campay-signature'] as string | undefined) ?? '';
    if (!sig) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  parseWebhook(body: unknown, _cfg: PaymentProviderConfig): PollResult & { externalRef: string } {
    const b = body as { reference?: string; status?: string };
    const status = (b.status ?? '').toUpperCase();
    return {
      externalRef: b.reference ?? '',
      status: status === 'SUCCESSFUL' ? 'SUCCEEDED' : status === 'FAILED' ? 'FAILED' : 'PENDING',
      paidAt: status === 'SUCCESSFUL' ? new Date() : undefined,
      raw: body,
    };
  }
}
