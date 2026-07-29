/**
 * Application d'un code promo sur une facture depuis le backoffice (guichet).
 * Monte sous `/invoices`, en complement de invoice.routes.
 *
 * Meme moteur que le portail client, mais l'agent agit au nom du client : on
 * derive le clientId de la facture au lieu de le prendre du token, et l'action
 * est tracee avec son userId (AuditLog PROMO_CODE_APPLIED / _REMOVED, ecrit
 * par PromoCodeService).
 */
import { Router } from 'express';
import { applyPromoCodeSchema, type ApplyPromoCodeInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { container } from '../../../container';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { invoiceScope, scopeCtx } from '../../../application/services/scope/agencyScope';
import { PromoCodeService } from '../../../application/services/promo/PromoCodeService';
import { NotFoundError } from '../../../domain/errors/BusinessError';

const router = Router();

router.use(authenticate);

async function invoiceClientId(invoiceId: string): Promise<string> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { clientId: true },
  });
  if (!invoice) throw new NotFoundError('Facture', invoiceId);
  return invoice.clientId;
}

router.post(
  '/:id/promo-code',
  validate(applyPromoCodeSchema),
  requirePermission('promocode.apply'),
  async (req, res, next) => {
    try {
      await invoiceScope.assert(req.params.id, scopeCtx(req));
      const { code } = req.body as ApplyPromoCodeInput;
      const result = await container.resolve(PromoCodeService).apply({
        code,
        invoiceId: req.params.id,
        clientId: await invoiceClientId(req.params.id),
        appliedByUserId: req.user?.userId ?? null,
      });
      res.json({ success: true, data: result.invoice });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id/promo-code', requirePermission('promocode.apply'), async (req, res, next) => {
  try {
    await invoiceScope.assert(req.params.id, scopeCtx(req));
    const invoice = await container.resolve(PromoCodeService).remove({
      invoiceId: req.params.id,
      userId: req.user?.userId ?? null,
    });
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

/**
 * Simulation d'un code au guichet : permet a l'agent d'annoncer la remise avant
 * de la poser. Lecture seule.
 */
router.post(
  '/:id/promo-code/preview',
  validate(applyPromoCodeSchema),
  requirePermission('promocode.apply'),
  async (req, res, next) => {
    try {
      await invoiceScope.assert(req.params.id, scopeCtx(req));
      const { code } = req.body as ApplyPromoCodeInput;
      const preview = await container.resolve(PromoCodeService).preview({
        code,
        invoiceId: req.params.id,
        clientId: await invoiceClientId(req.params.id),
      });
      res.json({ success: true, data: preview });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
