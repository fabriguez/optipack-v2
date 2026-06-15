/**
 * Bridge : expose /client-portal/payments/checkout et /client-portal/payments/orders/:id
 * compatibles avec le contrat `@transitsoftservices/payments` (CheckoutInput / PaymentOrder)
 * utilise par web-client et web-desktop.
 *
 * Internement ces routes delegent a l'orchestrateur PaymentIntent existant.
 */
import { Router } from 'express';
import { prisma } from '../../../config/database';
import { authenticateClient } from '../../controllers/ClientPortalController';
import { orchestratePaymentInitiation } from '../../../application/services/PaymentOrchestratorService';
import type { TenantPaymentConfig } from '../../../infrastructure/payments/types';
import { container } from '../../../container';
import { OnlinePaymentSettlementService } from '../../../application/services/OnlinePaymentSettlementService';
import { buildWebhookBase } from './payment-intent.routes';
import type {
  PaymentOrder,
  ChargeAttempt,
  PaymentStatus,
} from '@transitsoftservices/payments';

const router = Router();

// --- Helpers ----------------------------------------------------------------

/** Derive ISO-2 country from E.164 phone prefix. */
const PREFIX_TO_COUNTRY: Record<string, string> = {
  '237': 'CM', '221': 'SN', '225': 'CI', '226': 'BF',
  '233': 'GH', '254': 'KE', '250': 'RW', '241': 'GA',
  '243': 'CD', '242': 'CG', '256': 'UG', '255': 'TZ',
  '232': 'SL', '260': 'ZM', '257': 'BI', '228': 'TG',
};

function countryFromPhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/[^0-9]/g, '');
  for (const [prefix, country] of Object.entries(PREFIX_TO_COUNTRY)) {
    if (digits.startsWith(prefix)) return country;
  }
  return undefined;
}

type IntentStatus =
  | 'PENDING' | 'INITIATED' | 'AWAITING_USER' | 'PROCESSING'
  | 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

function mapIntentStatus(s: IntentStatus): PaymentStatus {
  switch (s) {
    case 'PENDING':      return 'PENDING';
    case 'INITIATED':    return 'CHARGE_REQUESTED';
    case 'AWAITING_USER': return 'AWAITING_USER_OTP';
    case 'PROCESSING':   return 'CHARGE_REQUESTED';
    case 'SUCCEEDED':    return 'SUCCEEDED';
    case 'FAILED':       return 'FAILED';
    case 'EXPIRED':      return 'EXPIRED';
    case 'CANCELLED':    return 'CANCELLED';
  }
}

type AttemptStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'TIMEOUT';

function mapAttemptStatus(s: AttemptStatus): PaymentStatus {
  switch (s) {
    case 'PENDING':    return 'AWAITING_USER_OTP';
    case 'SUCCEEDED':  return 'SUCCEEDED';
    case 'FAILED':     return 'FAILED';
    case 'TIMEOUT':    return 'EXPIRED';
  }
}

type AttemptRow = {
  provider: string;
  status: AttemptStatus;
  externalRef: string | null;
  errorMessage: string | null;
  startedAt: Date;
  providerPayload: unknown;
};

function mapAttempt(a: AttemptRow): ChargeAttempt {
  const payload = a.providerPayload as Record<string, unknown> | null;
  const redirectUrl = payload?.redirectUrl as string | undefined;
  const instructions = payload?.instructions as string | undefined;
  let next: ChargeAttempt['next'];
  if (redirectUrl) {
    next = { type: 'redirect', url: redirectUrl };
  } else if (instructions) {
    next = { type: 'otp', instruction: instructions };
  }
  return {
    providerId: a.provider.toLowerCase(),
    status: mapAttemptStatus(a.status),
    externalRef: a.externalRef ?? undefined,
    message: a.errorMessage ?? undefined,
    next,
    attemptedAt: a.startedAt.toISOString(),
  };
}

function toPaymentOrder(
  intent: Awaited<ReturnType<typeof fetchIntent>>,
): PaymentOrder {
  return {
    id: intent!.id,
    status: mapIntentStatus(intent!.status as IntentStatus),
    finalProvider: intent!.finalProvider ?? undefined,
    amount: { amount: Number(intent!.amount), currency: intent!.currency },
    reference: intent!.invoiceId,
    referenceType: 'INVOICE',
    attempts: intent!.attempts.map(mapAttempt),
    createdAt: intent!.createdAt.toISOString(),
    updatedAt: intent!.updatedAt.toISOString(),
  };
}

async function fetchIntent(id: string) {
  return prisma.paymentIntent.findUnique({
    where: { id },
    include: {
      attempts: {
        orderBy: { startedAt: 'asc' },
        select: {
          provider: true,
          status: true,
          externalRef: true,
          errorMessage: true,
          startedAt: true,
          providerPayload: true,
        },
      },
    },
  });
}

async function getTenantPaymentConfig(orgId: string): Promise<TenantPaymentConfig | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { paymentProvidersConfig: true },
  });
  return (org?.paymentProvidersConfig as TenantPaymentConfig | null) ?? null;
}

// --- Routes -----------------------------------------------------------------

/**
 * POST /client-portal/payments/checkout
 * Body : CheckoutInput (@transitsoftservices/payments)
 * Cree un PaymentIntent + lance l'orchestration, retourne { order, attempt }.
 */
router.post('/payments/checkout', authenticateClient, async (req, res, next) => {
  try {
    const { clientId } = req.clientPortal!;
    const { reference, referenceType, kind, phone, customer, amount, currency } = req.body ?? {};

    if (!reference || referenceType !== 'INVOICE') {
      return res.status(400).json({ success: false, message: 'reference (invoiceId) et referenceType=INVOICE requis' });
    }
    if (!kind || !amount) {
      return res.status(400).json({ success: false, message: 'kind et amount requis' });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: reference },
      select: { id: true, clientId: true, balance: true, currency: true, reference: true, agency: { select: { organizationId: true } } },
    });
    if (!invoice || invoice.clientId !== clientId) {
      return res.status(404).json({ success: false, message: 'Facture introuvable' });
    }
    if (Number(invoice.balance ?? 0) <= 0) {
      return res.status(400).json({ success: false, message: 'Facture deja payee' });
    }

    const channelMap: Record<string, string> = {
      mobile_money: 'MOBILE_MONEY',
      card: 'CARD',
      bank_transfer: 'BANK_TRANSFER',
      cash: 'CASH',
    };
    const channel = channelMap[kind as string] ?? 'MOBILE_MONEY';
    const payerPhone = phone ?? customer?.phone;
    const country = countryFromPhone(payerPhone);
    const organizationId = invoice.agency.organizationId;

    const intent = await prisma.paymentIntent.create({
      data: {
        organizationId,
        clientId,
        invoiceId: invoice.id,
        amount: Number(amount),
        currency: (currency ?? invoice.currency ?? 'XAF') as string,
        channel: channel as 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER' | 'USSD',
        country: country ?? null,
        payerPhone: payerPhone ?? null,
        payerEmail: customer?.email ?? null,
        status: 'PENDING',
      },
    });

    const tenantConfig = await getTenantPaymentConfig(organizationId);
    const outcome = await orchestratePaymentInitiation(tenantConfig, {
      intentId: intent.id,
      channel: channel as 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER' | 'USSD',
      amount: Number(amount),
      currency: (currency ?? invoice.currency ?? 'XAF') as string,
      country,
      payerPhone,
      payerEmail: customer?.email,
      payerName: customer?.fullName,
      description: `Facture ${invoice.reference}`,
      webhookBaseUrl: buildWebhookBase(req),
      externalReference: invoice.reference,
    });

    let refreshed = await fetchIntent(intent.id);
    if (refreshed?.status === 'SUCCEEDED' && !refreshed.paymentId) {
      try {
        await container.resolve(OnlinePaymentSettlementService).settleSucceededIntent(intent.id);
      } catch {
        // Non-bloquant
      }
      refreshed = await fetchIntent(intent.id);
    }

    const order = toPaymentOrder(refreshed!);
    const lastAttempt = order.attempts[order.attempts.length - 1] ?? null;
    // Injecter redirectUrl / instructions dans le dernier attempt depuis le resultat d'orchestration
    if (lastAttempt && outcome.result) {
      if (outcome.result.redirectUrl) {
        lastAttempt.next = { type: 'redirect', url: outcome.result.redirectUrl };
      } else if (outcome.result.instructions && !lastAttempt.next) {
        lastAttempt.next = { type: 'otp', instruction: outcome.result.instructions };
      }
    }

    res.json({ success: true, data: { order, attempt: lastAttempt } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /client-portal/payments/orders/:id
 * Polling de statut par le web-client. Retourne un PaymentOrder.
 */
router.get('/payments/orders/:id', authenticateClient, async (req, res, next) => {
  try {
    const { clientId } = req.clientPortal!;
    const intent = await fetchIntent(req.params.id);
    if (!intent || intent.clientId !== clientId) {
      return res.status(404).json({ success: false, message: 'Commande introuvable' });
    }
    if (intent.status === 'SUCCEEDED' && !intent.paymentId) {
      try {
        await container.resolve(OnlinePaymentSettlementService).settleSucceededIntent(intent.id);
      } catch {
        // Non-bloquant
      }
    }
    const freshIntent = await fetchIntent(req.params.id);
    res.json({ success: true, data: toPaymentOrder(freshIntent!) });
  } catch (err) {
    next(err);
  }
});

export default router;
