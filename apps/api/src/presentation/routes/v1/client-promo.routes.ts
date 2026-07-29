/**
 * Codes promo cote portail client.
 *
 * Le client peut consulter ses codes (attributions nominatives + codes publics
 * encore valables), simuler un code sur une facture avant de payer, puis
 * l'appliquer ou le retirer tant que la facture n'est pas soldee.
 *
 * L'autorisation est une verification de propriete (`invoice.clientId ===
 * clientId`), portee par PromoCodeService : `requirePermission` ne s'applique
 * pas aux tokens client (cf. policyContext).
 */
import { Router } from 'express';
import { applyPromoCodeSchema, type ApplyPromoCodeInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { container } from '../../../container';
import { validate } from '../../middleware/validate';
import { authenticateClient } from '../../controllers/ClientPortalController';
import { PromoCodeService } from '../../../application/services/promo/PromoCodeService';
import { ListClientPromoCodesUseCase } from '../../../application/use-cases/promo-code/PromoCodeAssignmentUseCases';
import { NotFoundError } from '../../../domain/errors/BusinessError';
import { deriveInvoiceView } from '../../../application/services/invoiceView';
import { StorageChargeService } from '../../../application/services/StorageChargeService';

const router = Router();

async function clientOrgId(clientId: string): Promise<string> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { organizationId: true },
  });
  if (!client) throw new NotFoundError('Client', clientId);
  return client.organizationId;
}

/** Facture enrichie du magasinage en cours, comme partout ailleurs cote portail. */
async function invoicePayload(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true, reference: true, totalAmount: true, discount: true,
      promoDiscount: true, promoCodeLabel: true, tva: true, netAmount: true,
      paidAmount: true, balance: true, currency: true, status: true,
    },
  });
  if (!invoice) throw new NotFoundError('Facture', invoiceId);
  const pending = await container.resolve(StorageChargeService).pendingForInvoice(invoiceId);
  return { ...invoice, ...deriveInvoiceView(invoice, pending) };
}

/**
 * GET /client-portal/promo-codes
 * Codes du client : ceux qui lui sont attribues nominativement, plus les codes
 * publics en cours.
 */
router.get('/promo-codes', authenticateClient, async (req, res, next) => {
  try {
    const { clientId } = req.clientPortal!;
    const data = await container.resolve(ListClientPromoCodesUseCase).execute({
      organizationId: await clientOrgId(clientId),
      clientId,
      includePublic: true,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /client-portal/invoices/:id/promo-code/preview
 * Simule le code sans rien ecrire : alimente l'affichage "remise appliquee"
 * du tunnel de paiement avant validation.
 */
router.post(
  '/invoices/:id/promo-code/preview',
  authenticateClient,
  validate(applyPromoCodeSchema),
  async (req, res, next) => {
    try {
      const { clientId } = req.clientPortal!;
      const { code } = req.body as ApplyPromoCodeInput;
      const preview = await container.resolve(PromoCodeService).preview({
        code,
        invoiceId: req.params.id,
        clientId,
      });
      res.json({ success: true, data: preview });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /client-portal/invoices/:id/promo-code
 * Applique le code sur la facture. Le solde renvoye est celui a payer une fois
 * la remise deduite.
 */
router.post(
  '/invoices/:id/promo-code',
  authenticateClient,
  validate(applyPromoCodeSchema),
  async (req, res, next) => {
    try {
      const { clientId } = req.clientPortal!;
      const { code } = req.body as ApplyPromoCodeInput;
      await container.resolve(PromoCodeService).apply({
        code,
        invoiceId: req.params.id,
        clientId,
        appliedByUserId: null,
      });
      res.json({ success: true, data: await invoicePayload(req.params.id) });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /client-portal/invoices/:id/promo-code
 * Retire le code encore reserve et rend le quota au client.
 */
router.delete('/invoices/:id/promo-code', authenticateClient, async (req, res, next) => {
  try {
    const { clientId } = req.clientPortal!;
    await container.resolve(PromoCodeService).remove({ invoiceId: req.params.id, clientId });
    res.json({ success: true, data: await invoicePayload(req.params.id) });
  } catch (err) {
    next(err);
  }
});

export default router;
