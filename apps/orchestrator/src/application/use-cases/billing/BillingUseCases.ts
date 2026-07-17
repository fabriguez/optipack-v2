import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { logger } from '../../../infrastructure/logger';
import { StripeProvider } from '../../../infrastructure/billing/StripeProvider';
import { MobileMoneyProvider, type MoMoOperator } from '../../../infrastructure/billing/MobileMoneyProvider';
import { freezeQueue, unfreezeQueue, deleteQueue } from '../../../infrastructure/queue/queues';
import { UpgradeTenantPlanUseCase } from './UpgradeTenantPlanUseCase';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';
import { NotificationService } from '../../../infrastructure/notifications/NotificationService';

export const startCheckoutSchema = z.object({
  provider: z.enum(['stripe', 'mtn', 'orange', 'manual']),
  // Ce qu'on paie : soit un upgrade (planChangeId), soit une extension subscription
  intent: z.discriminatedUnion('type', [
    z.object({ type: z.literal('plan_change'), planChangeId: z.string().uuid() }),
    z.object({ type: z.literal('subscription_renewal'), tenantId: z.string().uuid(), months: z.number().int().positive() }),
  ]),
  // Pour MoMo
  phone: z.string().optional(),
});

export type StartCheckoutInput = z.infer<typeof startCheckoutSchema>;

@injectable()
export class BillingUseCases {
  constructor(
    private stripe: StripeProvider,
    private momo: MobileMoneyProvider,
    private upgradeUseCase: UpgradeTenantPlanUseCase,
    private notifications: NotificationService,
  ) {}

  /**
   * Demarre un checkout pour un upgrade ou un renouvellement.
   * Retourne soit l'URL Stripe, soit le code USSD/instructions MoMo, soit un placeholder
   * pour paiement manuel (l'ops admin valide plus tard).
   */
  async startCheckout(input: StartCheckoutInput) {
    let amount: number; // XAF entier
    let description: string;
    let tenantId: string;
    let metadata: Record<string, string> = {};

    if (input.intent.type === 'plan_change') {
      const change = await prisma.planChange.findUnique({
        where: { id: input.intent.planChangeId },
        include: { toPlan: true, tenant: true },
      });
      if (!change) throw new NotFoundError('PlanChange', input.intent.planChangeId);
      if (change.status !== 'pending_payment') {
        throw new BusinessError(`PlanChange dans l'etat ${change.status} : pas de paiement attendu`);
      }
      amount = Math.round(Number(change.toPlan.pricePerMonth));
      description = `Plan ${change.toPlan.name} pour ${change.tenant.name}`;
      tenantId = change.tenantId;
      metadata = { type: 'plan_change', planChangeId: change.id, tenantId };
    } else {
      const tenant = await prisma.tenant.findUnique({
        where: { id: input.intent.tenantId },
        include: { subscription: true },
      });
      if (!tenant) throw new NotFoundError('Tenant', input.intent.tenantId);
      const monthly = tenant.subscription
        ? Number(tenant.subscription.pricePerMonth)
        : 0;
      amount = Math.round(monthly * input.intent.months);
      description = `Abonnement ${tenant.name} (${input.intent.months} mois)`;
      tenantId = tenant.id;
      metadata = { type: 'subscription_renewal', tenantId, months: String(input.intent.months) };
    }

    if (input.provider === 'stripe') {
      if (!this.stripe.isConfigured()) {
        throw new BusinessError('Stripe non configure cote serveur');
      }
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      const session = await this.stripe.createCheckoutSession({
        // Stripe demande des centimes ; XAF n'a pas de subdivision usuelle. On *100 pour preserver la convention amount-en-plus-petite-unite.
        amount: amount * 100,
        currency: 'eur', // Stripe ne supporte pas XAF directement. Conversion manuelle a faire en prod.
        successUrl: `${config.publicWebUrl}/billing/success?ref=${encodeURIComponent(metadata.planChangeId ?? metadata.tenantId)}`,
        cancelUrl: `${config.publicWebUrl}/billing/cancel`,
        customerEmail: tenant?.ownerEmail ?? 'admin@transitsoftservices.com',
        metadata,
        productName: description,
      });
      return { provider: 'stripe', checkoutUrl: session.checkoutUrl, sessionId: session.sessionId };
    }

    if (input.provider === 'mtn' || input.provider === 'orange') {
      if (!input.phone) throw new BusinessError('Numero de telephone requis pour Mobile Money');
      const result = await this.momo.initiate({
        operator: input.provider as MoMoOperator,
        phone: input.phone,
        amount,
        externalRef: metadata.planChangeId ?? `renew-${tenantId}-${Date.now()}`,
        description,
      });
      // Crée une trace Payment "pending"
      const sub = await prisma.subscription.findUnique({ where: { tenantId } });
      if (sub) {
        await prisma.payment.create({
          data: {
            subscriptionId: sub.id,
            amount,
            currency: 'XAF',
            provider: input.provider,
            externalRef: result.providerRef,
            status: result.status,
          },
        });
      }
      return { provider: input.provider, ...result };
    }

    // Manuel : record paiement pending, admin validera
    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    let payment = null;
    if (sub) {
      payment = await prisma.payment.create({
        data: {
          subscriptionId: sub.id,
          amount,
          currency: 'XAF',
          provider: 'manual',
          status: 'pending',
        },
      });
    }
    return { provider: 'manual', paymentId: payment?.id, message: 'En attente de validation manuelle par l\'ops admin.' };
  }

  /**
   * Confirme un paiement (apres webhook Stripe / verification MoMo / validation manuelle).
   * Effets :
   *  - Marque le Payment "succeeded"
   *  - Etend la subscription (+1 mois par defaut)
   *  - Si le tenant etait FROZEN -> declenche un job UNFREEZE
   *  - Si le paiement etait pour un PlanChange -> applique le changement (restart containers)
   */
  async confirmPayment(opts: {
    paymentId?: string;
    planChangeId?: string;
    tenantId?: string;
    months?: number;
    externalRef?: string;
  }) {
    let tenantId = opts.tenantId;

    // Cas plan_change : applique le PlanChange
    if (opts.planChangeId) {
      const change = await prisma.planChange.findUnique({ where: { id: opts.planChangeId } });
      if (!change) throw new NotFoundError('PlanChange', opts.planChangeId);
      tenantId = change.tenantId;
      // Applique via un JOB tracke (logs visibles cote ops-admin). Non bloquant.
      await this.upgradeUseCase.startApplyJob(change.id);
      logger.info({ planChangeId: change.id }, '[billing] plan change apply job started');
    }

    // Confirmation par paymentId seul (ex: bouton "confirmer" de la liste
    // paiements en attente) : on retrouve le tenant via la subscription du paiement.
    if (!tenantId && opts.paymentId) {
      const pay = await prisma.payment.findUnique({
        where: { id: opts.paymentId },
        include: { subscription: { select: { tenantId: true } } },
      });
      tenantId = pay?.subscription?.tenantId ?? undefined;
    }

    if (!tenantId) throw new BusinessError('tenantId ou planChangeId requis');

    // Update subscription expiresAt
    const months = opts.months ?? 1;
    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    if (sub) {
      const newExpiry = new Date(Math.max(sub.expiresAt.getTime(), Date.now()));
      newExpiry.setMonth(newExpiry.getMonth() + months);
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { expiresAt: newExpiry, isActive: true },
      });
    }

    // Update Payment record si ID fourni
    if (opts.paymentId) {
      await prisma.payment.update({
        where: { id: opts.paymentId },
        data: { status: 'succeeded', paidAt: new Date() },
      });
    }

    // Si tenant FROZEN -> unfreeze
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (tenant?.status === 'FROZEN') {
      const job = await prisma.provisioningJob.create({
        data: { tenantId, type: 'UNFREEZE', payload: { reason: 'payment_received' }, status: 'queued' },
      });
      await unfreezeQueue.add('unfreeze', { tenantId, provisioningJobId: job.id }, { jobId: job.id });
      logger.info({ tenantId }, '[billing] unfreeze enqueued after payment');
    }
  }

  /**
   * Paiement HORS LIGNE saisi par l'ops admin (especes / virement bancaire /
   * geste commercial). Aucun passage par Mobile Money ou Stripe : on enregistre
   * directement un Payment "manual" deja `succeeded`, on etend l'abonnement et
   * on degele le tenant s'il etait FROZEN. Le tenant ne sera donc PAS regele au
   * prochain cron (expiresAt repousse dans le futur).
   */
  async recordOfflinePayment(opts: {
    tenantId: string;
    months: number;
    amount?: number;
    note?: string;
  }): Promise<{ paymentId: string; amount: number; months: number; expiresAt: Date | null }> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: opts.tenantId },
      include: { subscription: true },
    });
    if (!tenant) throw new NotFoundError('Tenant', opts.tenantId);
    if (!tenant.subscription) {
      throw new BusinessError("Ce tenant n'a pas d'abonnement a regler");
    }

    const months = Math.max(1, Math.floor(opts.months));
    const amount =
      opts.amount != null && opts.amount >= 0
        ? Math.round(opts.amount)
        : Math.round(Number(tenant.subscription.pricePerMonth) * months);

    const payment = await prisma.payment.create({
      data: {
        subscriptionId: tenant.subscription.id,
        amount,
        currency: tenant.subscription.currency || 'XAF',
        provider: 'manual',
        status: 'succeeded',
        paidAt: new Date(),
        externalRef: opts.note?.trim() ? `offline:${opts.note.trim()}` : 'offline',
      },
    });

    // Reutilise la logique centrale : marque le paiement, etend expiresAt et
    // declenche l'UNFREEZE si le tenant etait gele.
    await this.confirmPayment({ paymentId: payment.id, tenantId: opts.tenantId, months });

    const sub = await prisma.subscription.findUnique({ where: { tenantId: opts.tenantId } });
    logger.info(
      { tenantId: opts.tenantId, amount, months, expiresAt: sub?.expiresAt },
      '[billing] paiement hors ligne enregistre',
    );
    return { paymentId: payment.id, amount, months, expiresAt: sub?.expiresAt ?? null };
  }

  /**
   * Cron : annule les paiements restes `pending` au-dela de `staleMinutes`
   * (defaut 30 min) sans confirmation. Concerne les paiements automatiques
   * (mtn/orange/stripe) dont le push USSD / la session a expire. Les paiements
   * `manual` sont EXCLUS : ils attendent une validation humaine de l'ops admin.
   */
  async runCancelStalePendingPaymentsCron(
    staleMinutes = Number(process.env.OPS_PENDING_PAYMENT_TTL_MIN ?? '30'),
  ): Promise<{ cancelled: number }> {
    const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);
    const { count } = await prisma.payment.updateMany({
      where: {
        status: 'pending',
        provider: { not: 'manual' },
        createdAt: { lt: cutoff },
      },
      data: { status: 'cancelled' },
    });
    if (count > 0) {
      logger.info({ cancelled: count, staleMinutes }, '[billing] paiements pending expires -> annules');
    }
    return { cancelled: count };
  }

  /**
   * Cron quotidien : freeze les tenants dont la subscription a expire.
   */
  async runAutoFreezeCron(): Promise<{ frozen: number }> {
    const now = new Date();
    const expired = await prisma.tenant.findMany({
      where: {
        status: 'ACTIVE',
        subscription: { expiresAt: { lt: now } },
      },
      include: { subscription: true },
    });

    let frozen = 0;
    for (const t of expired) {
      const job = await prisma.provisioningJob.create({
        data: {
          tenantId: t.id,
          type: 'FREEZE',
          payload: { reason: 'subscription_expired', expiresAt: t.subscription?.expiresAt },
          status: 'queued',
        },
      });
      await freezeQueue.add('freeze', { tenantId: t.id, provisioningJobId: job.id }, { jobId: job.id });
      frozen++;
      logger.warn({ tenantId: t.id, slug: t.slug }, '[billing] tenant subscription expired -> freeze enqueued');
    }
    return { frozen };
  }

  /**
   * Cron quotidien : envoie un preavis aux tenants dont la subscription expire dans <= 7j.
   * Anti-spam : on ne renotifie pas si `lastExpiryNoticeAt` < 24h.
   */
  async runExpiringNoticeCron(): Promise<{ notified: number }> {
    const now = new Date();
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const candidates = await prisma.tenant.findMany({
      where: {
        status: 'ACTIVE',
        subscription: {
          isActive: true,
          expiresAt: { gt: now, lte: horizon },
          OR: [{ lastExpiryNoticeAt: null }, { lastExpiryNoticeAt: { lt: oneDayAgo } }],
        },
      },
      include: { subscription: true },
    });

    let notified = 0;
    for (const t of candidates) {
      if (!t.subscription) continue;
      const daysLeft = Math.max(
        1,
        Math.ceil((t.subscription.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      );
      const payLink = `${config.publicWebUrl}/billing?tenant=${t.slug}`;
      await this.notifications.subscriptionExpiring(t.ownerEmail, t.slug, daysLeft, payLink);
      await prisma.subscription.update({
        where: { id: t.subscription.id },
        data: { lastExpiryNoticeAt: now },
      });
      notified++;
    }
    if (notified > 0) {
      logger.info({ notified }, '[billing] preavis expiration envoyes');
    }
    return { notified };
  }

  /**
   * Cron : libere les ressources des tenants FROZEN > 30 jours (drop containers + DB).
   * Le tenant passe en ARCHIVED et ne consomme plus de capacity.
   * Idempotent : si deja archive, ne fait rien.
   */
  async runReleaseLongFrozenCron(thresholdDays = 30): Promise<{ archived: number }> {
    const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);
    const longFrozen = await prisma.tenant.findMany({
      where: { status: 'FROZEN', freezedAt: { not: null, lt: cutoff } },
    });
    let archived = 0;
    for (const t of longFrozen) {
      const job = await prisma.provisioningJob.create({
        data: {
          tenantId: t.id,
          type: 'DELETE',
          payload: { reason: 'long_frozen_release', frozenAt: t.freezedAt },
          status: 'queued',
        },
      });
      // Le worker delete (Phase 2) drop la DB + remove containers + archive.
      await deleteQueue.add('delete', { tenantId: t.id, provisioningJobId: job.id }, { jobId: job.id });
      archived++;
      logger.warn(
        { tenantId: t.id, slug: t.slug, daysFrozen: thresholdDays },
        '[billing] long-frozen tenant -> delete enqueue',
      );
    }
    return { archived };
  }
}
