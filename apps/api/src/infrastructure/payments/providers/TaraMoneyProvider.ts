import crypto from 'node:crypto';
import type {
  IPaymentProvider,
  InitiateInput,
  InitiateResult,
  PaymentProviderConfig,
  PollResult,
} from '../types';

interface TaraInitiateResponse {
  message?: string;
  status?: string;
  vendor?: string;
  authUrl?: string;
}

interface TaraPollResponse {
  productId?: string;
  status?: string;
  message?: string;
}

interface TaraWebhookBody {
  businessId?: string;
  paymentId?: string;
  collectionId?: string;
  phoneNumber?: string;
  creationDate?: string;
  changeDate?: string;
  status?: string;
}

// Countries where Wave is the preferred MoMo network.
const WAVE_COUNTRIES = new Set(['SN', 'BF', 'CI']);

/**
 * TaraMoney — Mobile Money multi-pays (14+ pays Afrique).
 * Doc : https://www.dklo.co/api/tara
 *
 * Credentials attendus dans config.credentials :
 *   - apiKey         : cle publique Taramoney
 *   - businessId     : identifiant business Taramoney
 *   - webhookSecret  : secret HMAC pour verifier les webhooks (optionnel si non configure)
 *
 * Particularite : le webhook API payment ne contient pas de productId.
 * On encode l'intentId dans le path du webhookUrl pour resoudre l'attempt cote serveur.
 * Route attendue : POST /webhooks/payment/taramoney/:intentId
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
    if (!input.payerPhone) {
      return { status: 'FAILED', errorCode: 'NO_PHONE', errorMessage: 'Numero MoMo requis' };
    }

    const network = input.country && WAVE_COUNTRIES.has(input.country) ? 'wave' : '';
    // On utilise intentId comme productId (unique par session) pour eviter
    // les collisions lors de retentatives sur la meme facture.
    const webhookUrl = `${input.webhookUrl}/${encodeURIComponent(input.intentId)}`;

    try {
      const res = await fetch(`${this.baseUrl(cfg)}/mobilepay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: cfg.credentials.apiKey,
          businessId: cfg.credentials.businessId,
          productId: input.intentId,
          productName: input.description ?? `Paiement ${input.externalReference}`,
          network,
          productPrice: Math.round(input.amount),
          phoneNumber: input.payerPhone.replace(/[^0-9]/g, ''),
          webHookUrl: webhookUrl,
        }),
      });

      const body = (await res.json().catch(() => null)) as TaraInitiateResponse | null;

      if (!res.ok || body?.status === 'FAILURE') {
        return {
          status: 'FAILED',
          errorCode: `HTTP_${res.status}`,
          errorMessage: body?.message ?? 'TaraMoney a refuse la requete',
          raw: body,
        };
      }

      // Wave (Senegal, Burkina Faso, Cote d'Ivoire) : rediriger vers authUrl
      if (body?.authUrl) {
        return {
          status: 'REDIRECT',
          redirectUrl: body.authUrl,
          externalRef: input.intentId,
          raw: body,
        };
      }

      return {
        status: 'AWAITING_USER',
        externalRef: input.intentId,
        instructions: 'Confirmez le paiement sur votre telephone.',
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
    // Sans secret configure : accepter (compte non verifie, pas de signature active).
    if (!secret) return true;
    const sig = (headers['x-tara-signature'] as string | undefined) ?? '';
    if (!sig) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  }

  parseWebhook(body: unknown, _cfg: PaymentProviderConfig): PollResult & { externalRef: string } {
    const b = body as TaraWebhookBody;
    const status = (b.status ?? '').toUpperCase();
    return {
      // externalRef (intentId) injecte par la route dediee via URL param.
      externalRef: '',
      status: status === 'SUCCESS' ? 'SUCCEEDED' : status === 'FAILURE' ? 'FAILED' : 'PENDING',
      paidAt: status === 'SUCCESS' ? (b.changeDate ? new Date(b.changeDate) : new Date()) : undefined,
      raw: body,
    };
  }
}
