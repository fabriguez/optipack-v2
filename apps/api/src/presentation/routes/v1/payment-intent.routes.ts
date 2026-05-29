import { Router } from 'express';
import { prisma } from '../../../config/database';
import { authenticateClient } from '../../controllers/ClientPortalController';
import {
  orchestratePaymentInitiation,
} from '../../../application/services/PaymentOrchestratorService';
import type { TenantPaymentConfig } from '../../../infrastructure/payments/types';
import { getPaymentProvider } from '../../../infrastructure/payments/registry';
import { config } from '../../../config';
import { realtimeService } from '../../../infrastructure/realtime/RealtimeService';

const router = Router();

function buildWebhookBase(req: any): string {
  if (config.apiUrl) return config.apiUrl.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
  return `${proto}://${host}/api/v1`;
}

async function getTenantPaymentConfig(organizationId: string): Promise<TenantPaymentConfig | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { paymentProvidersConfig: true },
  });
  return (org?.paymentProvidersConfig as TenantPaymentConfig | null) ?? null;
}

/**
 * POST /client-portal/payment-intents
 * Body : { invoiceId, channel, country?, payerPhone?, payerEmail?, returnUrl? }
 * Cree un PaymentIntent + lance l'orchestration (1er provider eligible).
 */
router.post('/', authenticateClient, async (req, res, next) => {
  try {
    const { clientId } = req.clientPortal!;
    const { invoiceId, channel, country, payerPhone, payerEmail, returnUrl } = req.body ?? {};
    if (!invoiceId || !channel) {
      return res.status(400).json({ success: false, message: 'invoiceId et channel requis' });
    }
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        clientId: true,
        balance: true,
        currency: true,
        reference: true,
        agency: { select: { organizationId: true } },
      },
    });
    if (!invoice || invoice.clientId !== clientId) {
      return res.status(404).json({ success: false, message: 'Facture introuvable' });
    }
    const organizationId = invoice.agency.organizationId;
    const balance = Number(invoice.balance ?? 0);
    if (balance <= 0) {
      return res.status(400).json({ success: false, message: 'Facture deja payee' });
    }
    const amount = Number(req.body.amount ?? balance);
    if (amount <= 0 || amount > balance) {
      return res.status(400).json({ success: false, message: 'Montant invalide' });
    }

    const intent = await prisma.paymentIntent.create({
      data: {
        organizationId,
        clientId,
        invoiceId: invoice.id,
        amount,
        currency: invoice.currency ?? 'XAF',
        channel,
        country: country ?? null,
        payerPhone: payerPhone ?? null,
        payerEmail: payerEmail ?? null,
        status: 'PENDING',
      },
    });

    const tenantConfig = await getTenantPaymentConfig(organizationId);
    const outcome = await orchestratePaymentInitiation(tenantConfig, {
      intentId: intent.id,
      channel,
      amount,
      currency: invoice.currency ?? 'XAF',
      country,
      payerPhone,
      payerEmail,
      description: `Facture ${invoice.reference}`,
      returnUrl,
      webhookBaseUrl: buildWebhookBase(req),
      externalReference: invoice.reference,
    });

    const refreshed = await prisma.paymentIntent.findUnique({ where: { id: intent.id } });
    res.json({
      success: true,
      data: {
        intent: refreshed,
        attemptsTried: outcome.attemptsTried,
        provider: outcome.finalProvider,
        redirectUrl: outcome.result?.redirectUrl,
        instructions: outcome.result?.instructions,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /client-portal/payment-intents/:id : polling de status par le mobile. */
router.get('/:id', authenticateClient, async (req, res, next) => {
  try {
    const { clientId } = req.clientPortal!;
    const intent = await prisma.paymentIntent.findUnique({
      where: { id: req.params.id },
      include: { attempts: true },
    });
    if (!intent || intent.clientId !== clientId) {
      return res.status(404).json({ success: false, message: 'Intent introuvable' });
    }
    res.json({ success: true, data: intent });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /webhooks/payment/:provider
 * Endpoint public. La verification HMAC est faite par le provider impl.
 * IMPORTANT : ne pas wrapper avec authenticateClient -- les providers ne
 * voient pas notre JWT. La protection est cryptographique (signature payload).
 */
const webhookRouter = Router();
webhookRouter.post('/:provider', async (req, res, next) => {
  try {
    const providerName = req.params.provider.toUpperCase();
    const impl = getPaymentProvider(providerName);
    if (!impl) return res.status(404).json({ success: false, message: 'Provider inconnu' });

    // raw body : doit etre conserve par express.raw avant ce middleware.
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody) {
      return res.status(400).json({ success: false, message: 'Raw body manquant' });
    }

    // Le webhook ne porte pas l'organizationId : on resoud via externalRef -> attempt -> intent -> org -> config.
    // Pour l'instant on verifie la signature avec une config "any" tirée d'un attempt existant.
    // En l'absence de mapping, on rejette.
    const parsed = impl.parseWebhook(req.body, { name: providerName, priority: 0 });
    if (!parsed.externalRef) {
      return res.status(400).json({ success: false, message: 'externalRef manquant' });
    }
    const attempt = await prisma.paymentAttempt.findFirst({
      where: { externalRef: parsed.externalRef, provider: providerName },
      include: { intent: { include: { organization: { select: { paymentProvidersConfig: true } } } } },
    });
    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Attempt introuvable' });
    }
    const tenantConfig = attempt.intent.organization.paymentProvidersConfig as TenantPaymentConfig | null;
    const providerCfg = tenantConfig?.channels
      ?.flatMap((c) => c.providers)
      .find((p) => p.name.toUpperCase() === providerName);
    if (!providerCfg) {
      return res.status(400).json({ success: false, message: 'Config provider absente' });
    }
    if (!impl.verifyWebhook(req.headers, rawBody, providerCfg)) {
      return res.status(401).json({ success: false, message: 'Signature invalide' });
    }

    // Mise a jour Intent + Attempt
    if (parsed.status === 'SUCCEEDED') {
      await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: 'SUCCEEDED', finishedAt: new Date(), providerPayload: (parsed.raw ?? null) as never },
      });
      await prisma.paymentIntent.update({
        where: { id: attempt.intentId },
        data: { status: 'SUCCEEDED' },
      });
      // Realtime : notifie le client
      realtimeService.toClient(attempt.intent.clientId, 'payment-intent:succeeded', {
        intentId: attempt.intentId,
      });
    } else if (parsed.status === 'FAILED') {
      await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: 'FAILED', finishedAt: new Date(), errorMessage: parsed.errorMessage, providerPayload: (parsed.raw ?? null) as never },
      });
      await prisma.paymentIntent.update({
        where: { id: attempt.intentId },
        data: { status: 'FAILED' },
      });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export { router, webhookRouter };
export default router;
