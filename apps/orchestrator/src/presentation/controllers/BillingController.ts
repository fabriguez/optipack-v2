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
import { prisma } from '../../config/database';

export class BillingController {
  /**
   * GET /ops/billing/overview — vue agregee pour la page billing.
   * Retourne : MRR (sum des subs actives), encours impaye, prochaines
   * expirations, derniers paiements, plan-changes en attente.
   */
  static async overview(_req: Request, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      const [activeSubs, expiringSoon, pendingPayments, recentPayments, pendingPlanChanges] = await Promise.all([
        prisma.subscription.findMany({
          where: { isActive: true },
          select: { id: true, pricePerMonth: true, currency: true, plan: true, expiresAt: true, tenantId: true },
        }),
        prisma.subscription.findMany({
          where: { isActive: true, expiresAt: { lte: in14Days } },
          include: { tenant: { select: { id: true, slug: true, name: true, status: true } } },
          orderBy: { expiresAt: 'asc' },
          take: 20,
        }),
        prisma.payment.findMany({
          where: { status: 'pending' },
          include: { subscription: { include: { tenant: { select: { id: true, slug: true, name: true } } } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.payment.findMany({
          where: { status: 'succeeded' },
          include: { subscription: { include: { tenant: { select: { id: true, slug: true, name: true } } } } },
          orderBy: { paidAt: 'desc' },
          take: 20,
        }),
        prisma.planChange.findMany({
          where: { status: 'pending_payment' },
          include: { toPlan: { select: { code: true, name: true } }, tenant: { select: { id: true, slug: true, name: true } } },
          orderBy: { requestedAt: 'desc' },
          take: 50,
        }),
      ]);

      const mrrByCurrency: Record<string, number> = {};
      for (const sub of activeSubs) {
        const cur = sub.currency || 'XAF';
        mrrByCurrency[cur] = (mrrByCurrency[cur] ?? 0) + Number(sub.pricePerMonth);
      }

      res.json({
        success: true,
        data: {
          mrr: mrrByCurrency,
          activeSubscriptionsCount: activeSubs.length,
          expiringSoon,
          pendingPayments,
          recentPayments,
          pendingPlanChanges,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /ops/tenants/:id/billing — vue facturation scope tenant.
   * Abonnement courant + historique paiements + plan + plans disponibles.
   * Accessible au compte facturation tenant (enforceTenantParam en amont).
   */
  static async tenantBilling(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.params.id;
      const [tenant, subscription, plans] = await Promise.all([
        prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { id: true, slug: true, name: true, status: true, resourcePlanId: true },
        }),
        prisma.subscription.findUnique({
          where: { tenantId },
          include: {
            payments: { orderBy: { createdAt: 'desc' }, take: 50 },
          },
        }),
        prisma.resourcePlan.findMany({
          where: { isActive: true },
          orderBy: { pricePerMonth: 'asc' },
        }),
      ]);
      if (!tenant) throw new BusinessError('Tenant introuvable');

      const pendingPlanChange = await prisma.planChange.findFirst({
        where: { tenantId, status: 'pending_payment' },
        include: { toPlan: { select: { id: true, code: true, name: true, pricePerMonth: true, currency: true } } },
        orderBy: { requestedAt: 'desc' },
      });

      res.json({
        success: true,
        data: {
          tenant,
          subscription,
          payments: subscription?.payments ?? [],
          plans,
          pendingPlanChange,
        },
      });
    } catch (err) {
      next(err);
    }
  }

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
      // Le demandeur est determine par le TOKEN, jamais par le client :
      //  - compte facturation tenant (opsAdmin.tenantId defini) -> 'tenant_owner'
      //    => un upgrade exige un paiement prealable.
      //  - ops global (pas de tenantId) -> 'ops_admin'
      //    => applique immediatement les limites, sans paiement.
      const requestedBy = req.opsAdmin?.tenantId ? 'tenant_owner' : 'ops_admin';
      const parsed = requestUpgradeSchema.parse({ ...req.body, requestedBy });
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
      // Scope tenant : un compte facturation ne peut payer QUE pour son tenant.
      // On verifie que l'intent cible bien son tenantId (sinon 403).
      const scoped = req.opsAdmin?.tenantId;
      if (scoped) {
        const intentTenantId =
          parsed.intent.type === 'subscription_renewal'
            ? parsed.intent.tenantId
            : await BillingController.planChangeTenantId(parsed.intent.planChangeId);
        if (intentTenantId !== scoped) {
          throw new BusinessError('Vous ne pouvez regler que les factures de votre tenant');
        }
      }
      const result = await container.resolve(BillingUseCases).startCheckout(parsed);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /** Resout le tenantId d'un planChange (pour verifier le scope au checkout). */
  private static async planChangeTenantId(planChangeId: string): Promise<string | null> {
    const pc = await prisma.planChange.findUnique({
      where: { id: planChangeId },
      select: { tenantId: true },
    });
    return pc?.tenantId ?? null;
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
   * POST /ops/tenants/:id/billing/offline-payment — l'ops admin encaisse un
   * paiement hors ligne (especes / virement) pour le tenant, sans MoMo/Stripe.
   * Etend l'abonnement + degele si FROZEN. Superadmin uniquement.
   */
  static async recordOfflinePayment(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.params.id;
      const { months, amount, note } = req.body as {
        months?: number;
        amount?: number;
        note?: string;
      };
      const result = await container.resolve(BillingUseCases).recordOfflinePayment({
        tenantId,
        months: Number(months ?? 1),
        amount: amount != null ? Number(amount) : undefined,
        note: typeof note === 'string' ? note : undefined,
      });
      await container.resolve(AuditLogger).log(req, {
        action: 'PAYMENT_RECORDED_OFFLINE',
        entityType: 'Tenant',
        entityId: tenantId,
        payload: result,
      });
      res.json({ success: true, data: result });
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
