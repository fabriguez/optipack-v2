import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { BillingUseCases, startCheckoutSchema } from '../../application/use-cases/billing/BillingUseCases';
import {
  UpgradeTenantPlanUseCase,
  requestUpgradeSchema,
} from '../../application/use-cases/billing/UpgradeTenantPlanUseCase';
import { CapacityService } from '../../application/services/CapacityService';
import { StripeProvider } from '../../infrastructure/billing/StripeProvider';
import { AuditLogger } from '../../application/services/AuditLogger';
import { logger } from '../../infrastructure/logger';
import { BusinessError } from '../../domain/errors/BusinessError';

export class BillingController {
  /** GET /ops/vps/:id/capacity — etat de la capacite d'un VPS */
  static async vpsCapacity(req: Request, res: Response, next: NextFunction) {
    try {
      const report = await container.resolve(CapacityService).report(req.params.id);
      res.json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  }

  /** POST /ops/tenants/:id/upgrade — demande d'upgrade plan */
  static async requestUpgrade(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = requestUpgradeSchema.parse(req.body);
      const result = await container.resolve(UpgradeTenantPlanUseCase).requestUpgrade(req.params.id, parsed);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_PLAN_UPGRADE_REQUESTED',
        entityType: 'Tenant',
        entityId: req.params.id,
        payload: { toPlanCode: parsed.toPlanCode, status: result.status },
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /** POST /ops/billing/checkout — demarre un checkout (Stripe / MoMo / manuel) */
  static async startCheckout(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = startCheckoutSchema.parse(req.body);
      const result = await container.resolve(BillingUseCases).startCheckout(parsed);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /** POST /ops/billing/confirm-manual — l'ops admin confirme un paiement manuel */
  static async confirmManualPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { paymentId, planChangeId, tenantId, months } = req.body as {
        paymentId?: string;
        planChangeId?: string;
        tenantId?: string;
        months?: number;
      };
      await container.resolve(BillingUseCases).confirmPayment({ paymentId, planChangeId, tenantId, months });
      await container.resolve(AuditLogger).log(req, {
        action: 'PAYMENT_CONFIRMED_MANUAL',
        entityType: 'Payment',
        entityId: paymentId ?? planChangeId ?? tenantId ?? null,
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /ops/billing/webhook/stripe — webhook public (sans auth) signe par Stripe.
   * La route utilise `express.raw()` upstream : `req.body` est un Buffer.
   */
  static async stripeWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const sig = req.headers['stripe-signature'];
      if (!sig || typeof sig !== 'string') {
        return res.status(400).send('Missing signature');
      }
      const stripe = container.resolve(StripeProvider);
      const buf = req.body as unknown;
      const rawBody = Buffer.isBuffer(buf) ? buf.toString('utf8') : JSON.stringify(buf);
      if (!stripe.verifyWebhookSignature(rawBody, sig)) {
        return res.status(400).send('Invalid signature');
      }

      const event = JSON.parse(rawBody) as { type: string; data?: { object?: Record<string, unknown> } };
      logger.info({ type: event.type }, '[stripe-webhook] received');

      if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
        const obj = event.data?.object ?? {};
        const metadata = (obj.metadata ?? {}) as Record<string, string>;
        if (metadata.type === 'plan_change' && metadata.planChangeId) {
          await container.resolve(BillingUseCases).confirmPayment({
            planChangeId: metadata.planChangeId,
          });
        } else if (metadata.type === 'subscription_renewal' && metadata.tenantId) {
          await container.resolve(BillingUseCases).confirmPayment({
            tenantId: metadata.tenantId,
            months: Number(metadata.months ?? 1),
          });
        }
      }

      res.json({ received: true });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /ops/billing/webhook/momo — webhook MoMo (operateurs MTN/Orange).
   * Verification : champ `signature` dans le body ou header `X-MoMo-Signature` selon operateur.
   * Pour cette V1 on accepte le webhook sans verification stricte (a durcir avec credentials prod).
   */
  static async momoWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as { externalRef?: string; status?: string; providerRef?: string };
      logger.info({ body }, '[momo-webhook] received');

      if (body.status !== 'succeeded' && body.status !== 'success') {
        return res.json({ received: true });
      }

      // externalRef peut etre un planChangeId
      if (body.externalRef) {
        await container.resolve(BillingUseCases).confirmPayment({
          planChangeId: body.externalRef,
        }).catch(() => {/* not a planChange, fallback */});
      }

      res.json({ received: true });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /ops/billing/run-autofreeze — declenchement manuel du cron (utile en dev/test).
   * En prod, le cron interne (5 min) ou un cron externe l'appelle.
   */
  static async runAutoFreeze(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await container.resolve(BillingUseCases).runAutoFreezeCron();
      await container.resolve(AuditLogger).log(req, {
        action: 'BILLING_AUTOFREEZE_RUN',
        entityType: 'Billing',
        payload: result,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
