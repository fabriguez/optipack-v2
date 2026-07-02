import crypto from 'node:crypto';
import type {
  IPaymentProvider,
  InitiateInput,
  InitiateResult,
  PaymentProviderConfig,
  PollResult,
} from '../types';

interface TaraPaymentLinksResponse {
  status?: string;
  message?: string;
  whatsappLink?: string;
  telegramLink?: string;
  dikaloLink?: string;
  generalLink?: string;
  cardLink?: string;
  smsLink?: string;
}

interface TaraPollResponse {
  productId?: string;
  status?: string;
  message?: string;
}

interface TaraWebhookBody {
  businessId?: string;
  paymentId?: string;
  /** productId = notre intentId (present dans les webhooks payment-links / collect). */
  productId?: string;
  amount?: string;
  collectionId?: string;
  phoneNumber?: string;
  creationDate?: string;
  changeDate?: string;
  status?: string;
}

/**
 * TaraMoney — Paiement multi-pays via lien heberge (14+ pays Afrique).
 * Doc : https://www.dklo.co/api/tara/paymentlinks
 *
 * Flux : on genere un lien de paiement → on redirige le client vers generalLink.
 * TaraMoney gere la selection MoMo / carte sur sa page. Webhook en retour.
 *
 * Credentials attendus dans config.credentials :
 *   - apiKey         : cle publique Taramoney
 *   - businessId     : identifiant business Taramoney
 *   - webhookSecret  : secret HMAC pour verifier les webhooks (optionnel)
 *
 * Particularite webhook : le payload ne contient pas notre productId.
 * L'intentId est encode dans le path du webHookUrl.
 * Route : POST /webhooks/payment/taramoney/:intentId
 */
export class TaraMoneyProvider implements IPaymentProvider {
  readonly name = 'TARAMONEY';
  readonly channel = 'MOBILE_MONEY' as const;

  private baseUrl(cfg: PaymentProviderConfig): string {
    return cfg.apiBaseUrl ?? 'https://www.dklo.co/api/tara';
  }

  async initiate(input: InitiateInput, cfg: PaymentProviderConfig): Promise<InitiateResult> {
    if (!cfg.credentials?.apiKey || !cfg.credentials?.businessId) {
      return { status: 'FAILED', errorCode: 'NO_CREDENTIALS', errorMessage: 'TaraMoney non configure' };
    }

    // intentId comme productId : unique par session, evite collisions sur retentatives.
    const webhookUrl = `${input.webhookUrl}/${encodeURIComponent(input.intentId)}`;

    try {
      const res = await fetch(`${this.baseUrl(cfg)}/paymentlinks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: cfg.credentials.apiKey,
          businessId: cfg.credentials.businessId,
          productId: input.intentId,
          productName: input.description ?? `Paiement ${input.externalReference}`,
          productPrice: Math.round(input.amount),
          productDescription: input.description ?? `Facture ${input.externalReference}`,
          returnUrl: input.returnUrl,
          webHookUrl: webhookUrl,
        }),
      });

      const body = (await res.json().catch(() => null)) as TaraPaymentLinksResponse | null;

      if (!res.ok || (body?.status && body.status !== 'success')) {
        return {
          status: 'FAILED',
          errorCode: `HTTP_${res.status}`,
          errorMessage: body?.message ?? 'TaraMoney a refuse la requete',
          raw: body,
        };
      }

      const redirectUrl = body?.generalLink ?? body?.dikaloLink ?? body?.whatsappLink;
      if (!redirectUrl) {
        return {
          status: 'FAILED',
          errorCode: 'NO_LINK',
          errorMessage: 'TaraMoney n\'a pas retourne de lien de paiement',
          raw: body,
        };
      }

      return {
        status: 'REDIRECT',
        redirectUrl,
        externalRef: input.intentId,
        raw: body,
      };
    } catch (err) {
      return {
        status: 'FAILED',
        errorCode: 'EXCEPTION',
        errorMessage: String((err as Error).message ?? err),
      };
    }
  }

  async poll(externalRef: string, cfg: PaymentProviderConfig): Promise<PollResult> {
    if (!cfg.credentials?.apiKey || !cfg.credentials?.businessId) {
      return { status: 'PENDING', errorMessage: 'Credentials manquants' };
    }
    try {
      const res = await fetch(`${this.baseUrl(cfg)}/transactions/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: cfg.credentials.apiKey,
          businessId: cfg.credentials.businessId,
          productId: externalRef,
        }),
      });
      if (!res.ok) return { status: 'PENDING', errorMessage: `HTTP ${res.status}` };
      const body = (await res.json()) as TaraPollResponse;
      switch ((body.status ?? '').toUpperCase()) {
        case 'SUCCESS':
          return { status: 'SUCCEEDED', paidAt: new Date(), raw: body };
        case 'FAILURE':
          return { status: 'FAILED', errorMessage: body.message ?? 'Echec operateur', raw: body };
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
    // Sans secret configure : refuser (fail closed, coherent avec les autres providers).
    if (!secret) return false;
    const sig = (headers['x-tara-signature'] as string | undefined) ?? '';
    if (!sig) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  }

  parseWebhook(body: unknown, _cfg: PaymentProviderConfig): PollResult & { externalRef: string } {
    const b = body as TaraWebhookBody;
    const status = (b.status ?? '').toUpperCase();
    return {
      // productId = notre intentId (present dans tous les webhooks payment-links).
      // Fallback '' : la route dediee /taramoney/:intentId couvre le cas ou il est absent.
      externalRef: b.productId ?? '',
      status: status === 'SUCCESS' ? 'SUCCEEDED' : status === 'FAILURE' ? 'FAILED' : 'PENDING',
      paidAt: status === 'SUCCESS' ? (b.changeDate ? new Date(b.changeDate) : new Date()) : undefined,
      raw: body,
    };
  }
}
