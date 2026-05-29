import { prisma } from '../../config/database';
import { getPaymentProvider } from '../../infrastructure/payments/registry';
import type {
  PaymentChannel,
  PaymentChannelConfig,
  PaymentProviderConfig,
  TenantPaymentConfig,
  InitiateResult,
} from '../../infrastructure/payments/types';
import { createChildLogger } from '../../config/logger';

const logger = createChildLogger('PaymentOrchestrator');

/**
 * Selectionne les providers eligibles pour un canal + pays donnes,
 * tries par priority (asc). Filtre les providers dont les `countries`
 * sont definis et ne contiennent pas le pays demande.
 */
export function selectProviders(
  config: TenantPaymentConfig | null,
  channel: PaymentChannel,
  country?: string,
): PaymentProviderConfig[] {
  if (!config?.channels) return [];
  const channelConfig = config.channels.find((c: PaymentChannelConfig) => c.channel === channel);
  if (!channelConfig) return [];
  return [...channelConfig.providers]
    .filter((p) => !p.countries?.length || !country || p.countries.includes(country))
    .sort((a, b) => a.priority - b.priority);
}

interface OrchestrateParams {
  intentId: string;
  channel: PaymentChannel;
  amount: number;
  currency: string;
  country?: string;
  payerPhone?: string;
  payerEmail?: string;
  payerName?: string;
  description?: string;
  returnUrl?: string;
  webhookBaseUrl: string;
  externalReference: string;
}

export interface OrchestrateOutcome {
  attemptsTried: number;
  finalProvider?: string;
  result?: InitiateResult;
  /** True si on a abouti a un statut "actif" (AWAITING_USER/PROCESSING/REDIRECT/SUCCEEDED). */
  success: boolean;
}

/**
 * Tente chaque provider eligible jusqu'a obtenir un statut non-FAILED.
 * Chaque tentative est journalisee dans `payment_attempts`. La routine
 * met aussi a jour le statut du PaymentIntent en fonction du resultat final.
 */
export async function orchestratePaymentInitiation(
  config: TenantPaymentConfig | null,
  params: OrchestrateParams,
): Promise<OrchestrateOutcome> {
  const providers = selectProviders(config, params.channel, params.country);
  if (providers.length === 0) {
    await prisma.paymentIntent.update({
      where: { id: params.intentId },
      data: { status: 'FAILED' },
    });
    return { attemptsTried: 0, success: false };
  }

  let attemptsTried = 0;
  for (const cfg of providers) {
    const impl = getPaymentProvider(cfg.name);
    if (!impl) {
      logger.warn({ provider: cfg.name }, 'Provider configure mais non enregistre');
      continue;
    }
    if (impl.channel !== params.channel) {
      logger.warn({ provider: cfg.name, expected: params.channel, got: impl.channel }, 'Provider sur mauvais canal');
      continue;
    }
    const attempt = await prisma.paymentAttempt.create({
      data: {
        intentId: params.intentId,
        provider: cfg.name,
        status: 'PENDING',
      },
    });
    attemptsTried += 1;
    try {
      const result = await impl.initiate(
        {
          intentId: params.intentId,
          amount: params.amount,
          currency: params.currency,
          country: params.country,
          payerPhone: params.payerPhone,
          payerEmail: params.payerEmail,
          payerName: params.payerName,
          description: params.description,
          returnUrl: params.returnUrl,
          webhookUrl: `${params.webhookBaseUrl}/webhooks/payment/${cfg.name.toLowerCase()}`,
          externalReference: params.externalReference,
        },
        cfg,
      );
      if (result.status === 'FAILED') {
        await prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'FAILED',
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            providerPayload: (result.raw ?? null) as never,
            finishedAt: new Date(),
          },
        });
        continue; // Tente suivant
      }
      // Succes (AWAITING_USER / PROCESSING / REDIRECT / SUCCEEDED)
      await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: result.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'PENDING',
          externalRef: result.externalRef,
          providerPayload: (result.raw ?? null) as never,
          finishedAt: result.status === 'SUCCEEDED' ? new Date() : null,
        },
      });
      await prisma.paymentIntent.update({
        where: { id: params.intentId },
        data: {
          finalProvider: cfg.name,
          externalRef: result.externalRef,
          status: result.status === 'SUCCEEDED'
            ? 'SUCCEEDED'
            : result.status === 'REDIRECT'
              ? 'AWAITING_USER'
              : (result.status as 'AWAITING_USER' | 'PROCESSING'),
        },
      });
      return { attemptsTried, finalProvider: cfg.name, result, success: true };
    } catch (err) {
      await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'FAILED',
          errorCode: 'EXCEPTION',
          errorMessage: String((err as Error).message ?? err),
          finishedAt: new Date(),
        },
      });
      continue;
    }
  }

  await prisma.paymentIntent.update({
    where: { id: params.intentId },
    data: { status: 'FAILED' },
  });
  return { attemptsTried, success: false };
}
