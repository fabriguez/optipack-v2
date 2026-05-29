import crypto from 'node:crypto';
import type { IPaymentProvider, InitiateInput, InitiateResult, PaymentProviderConfig, PollResult } from '../types';

/**
 * MeSomb (Cameroun) - Mobile Money + Cartes.
 * Doc : https://mesomb.hachther.com/en/api/v1.1/
 * Credentials : applicationKey, accessKey, secretKey (HMAC nonce-based).
 */
export class MesombProvider implements IPaymentProvider {
  readonly name = 'MESOMB';
  readonly channel = 'MOBILE_MONEY' as const;

  private baseUrl(cfg: PaymentProviderConfig): string {
    return cfg.apiBaseUrl ?? 'https://mesomb.hachther.com/en/api/v1.1';
  }

  private sign(method: string, url: string, body: string, cfg: PaymentProviderConfig, nonce: string, dateIso: string): string {
    const secret = cfg.credentials?.secretKey ?? '';
    const payload = `${method}\n${url}\n${body}\n${nonce}\n${dateIso}`;
    return crypto.createHmac('sha1', secret).update(payload).digest('hex');
  }

  async initiate(input: InitiateInput, cfg: PaymentProviderConfig): Promise<InitiateResult> {
    const appKey = cfg.credentials?.applicationKey;
    const accessKey = cfg.credentials?.accessKey;
    if (!appKey || !accessKey || !cfg.credentials?.secretKey) {
      return { status: 'FAILED', errorCode: 'NO_CREDENTIALS', errorMessage: 'MeSomb non configure' };
    }
    if (!input.payerPhone) {
      return { status: 'FAILED', errorCode: 'NO_PHONE', errorMessage: 'Numero requis' };
    }
    try {
      const url = `${this.baseUrl(cfg)}/payment/collect/`;
      const body = JSON.stringify({
        amount: Math.round(input.amount),
        service: 'MTN', // ou 'ORANGE' selon prefixe — heuristique simple
        payer: input.payerPhone.replace(/[^0-9]/g, ''),
        country: input.country ?? 'CM',
        currency: input.currency || 'XAF',
        reference: input.externalReference,
        customer: { phone: input.payerPhone, email: input.payerEmail },
      });
      const nonce = crypto.randomBytes(12).toString('hex');
      const dateIso = new Date().toISOString();
      const sig = this.sign('POST', url, body, cfg, nonce, dateIso);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-MeSomb-Application': appKey,
          'X-MeSomb-Nonce': nonce,
          'X-MeSomb-Date': dateIso,
          Authorization: `HMAC-SHA1 Credential=${accessKey}, Signature=${sig}`,
          'Content-Type': 'application/json',
        },
        body,
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || data?.success === false) {
        return { status: 'FAILED', errorCode: `HTTP_${res.status}`, errorMessage: data?.message ?? 'MeSomb rejected', raw: data };
      }
      return {
        status: data?.status === 'SUCCESS' ? 'SUCCEEDED' : 'AWAITING_USER',
        externalRef: data?.reference,
        instructions: 'Validez sur votre telephone.',
        raw: data,
      };
    } catch (err) {
      return { status: 'FAILED', errorCode: 'EXCEPTION', errorMessage: String((err as Error).message ?? err) };
    }
  }

  async poll(externalRef: string, cfg: PaymentProviderConfig): Promise<PollResult> {
    const appKey = cfg.credentials?.applicationKey;
    const accessKey = cfg.credentials?.accessKey;
    if (!appKey || !accessKey) return { status: 'PENDING' };
    try {
      const url = `${this.baseUrl(cfg)}/payment/transaction/${externalRef}/`;
      const nonce = crypto.randomBytes(12).toString('hex');
      const dateIso = new Date().toISOString();
      const sig = this.sign('GET', url, '', cfg, nonce, dateIso);
      const res = await fetch(url, {
        headers: {
          'X-MeSomb-Application': appKey,
          'X-MeSomb-Nonce': nonce,
          'X-MeSomb-Date': dateIso,
          Authorization: `HMAC-SHA1 Credential=${accessKey}, Signature=${sig}`,
        },
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) return { status: 'PENDING' };
      const status = (data?.status ?? '').toUpperCase();
      if (status === 'SUCCESS') return { status: 'SUCCEEDED', paidAt: new Date(), raw: data };
      if (status === 'FAILED') return { status: 'FAILED', raw: data };
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
    const sig = (headers['x-mesomb-signature'] as string | undefined) ?? '';
    const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
    return sig === expected;
  }

  parseWebhook(body: unknown, _cfg: PaymentProviderConfig): PollResult & { externalRef: string } {
    const b = body as { reference?: string; status?: string };
    const status = (b?.status ?? '').toUpperCase();
    return {
      externalRef: b?.reference ?? '',
      status: status === 'SUCCESS' ? 'SUCCEEDED' : status === 'FAILED' ? 'FAILED' : 'PENDING',
      paidAt: status === 'SUCCESS' ? new Date() : undefined,
      raw: body,
    };
  }
}
