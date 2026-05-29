/**
 * Types partages pour l'orchestrateur de paiements electroniques.
 *
 * Architecture :
 *  - Un PaymentIntent (DB) regroupe N PaymentAttempt (un par provider essaye).
 *  - Le PaymentOrchestratorService selectionne les providers pertinents
 *    (channel + country, tries par priority) et tente chacun jusqu'a succes.
 *  - Chaque provider implemente IPaymentProvider et est enregistre dans
 *    PaymentProviderRegistry.
 */

export type PaymentChannel = 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER' | 'USSD';

export interface PaymentProviderConfig {
  /** Nom du provider, ex 'CAMPAY' / 'STRIPE' / 'INTOUCH'. */
  name: string;
  /** Plus petit = teste en premier. */
  priority: number;
  /** Pays ISO2 servis par ce provider. Vide = applicable a tous. */
  countries?: string[];
  /** Credentials propres au provider, chiffres au repos. */
  credentials?: Record<string, string>;
  /** Override de l'URL de base API (sandbox vs prod). */
  apiBaseUrl?: string;
}

export interface PaymentChannelConfig {
  channel: PaymentChannel;
  countries?: string[];
  providers: PaymentProviderConfig[];
}

export interface TenantPaymentConfig {
  channels: PaymentChannelConfig[];
}

export interface InitiateInput {
  intentId: string;
  amount: number;
  currency: string;
  country?: string;
  payerPhone?: string;
  payerEmail?: string;
  payerName?: string;
  description?: string;
  /** URL absolue ou rediriger l'utilisateur apres paiement (3DS / hosted). */
  returnUrl?: string;
  /** URL appelee par le provider en webhook. */
  webhookUrl: string;
  /** Reference cote tenant (visible dans le release status). */
  externalReference: string;
}

export type ProviderInitiateStatus =
  | 'AWAITING_USER' // utilisateur doit confirmer dans son app
  | 'PROCESSING' // provider traite, polling necessaire
  | 'REDIRECT' // rediriger vers une URL hosted
  | 'SUCCEEDED' // paiement deja confirme en synchrone (rare)
  | 'FAILED';

export interface InitiateResult {
  status: ProviderInitiateStatus;
  /** Reference renvoyee par le provider (pour polling / reconciliation). */
  externalRef?: string;
  /** Redirection URL si status=REDIRECT. */
  redirectUrl?: string;
  /** Instructions a afficher (ex : "Composez *126# puis tapez 1"). */
  instructions?: string;
  errorCode?: string;
  errorMessage?: string;
  /** Payload brut tronque pour audit. */
  raw?: unknown;
}

export type PollStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';

export interface PollResult {
  status: PollStatus;
  paidAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  raw?: unknown;
}

export interface IPaymentProvider {
  /** Identifiant unique en majuscule. */
  readonly name: string;
  /** Canal principal supporte. */
  readonly channel: PaymentChannel;

  /** Demarre une transaction. Le provider peut renvoyer immediatement ou non. */
  initiate(input: InitiateInput, config: PaymentProviderConfig): Promise<InitiateResult>;

  /** Verifie l'etat d'une transaction par externalRef. */
  poll(externalRef: string, config: PaymentProviderConfig): Promise<PollResult>;

  /**
   * Verifie la signature d'un webhook (HMAC, etc). Retourne true si valide.
   * `headers` et `body` proviennent de la requete Express.
   */
  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
    config: PaymentProviderConfig,
  ): boolean;

  /** Parse un webhook valide en un PollResult. */
  parseWebhook(body: unknown, config: PaymentProviderConfig): PollResult & { externalRef: string };
}
