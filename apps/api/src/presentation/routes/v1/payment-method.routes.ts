import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { prisma } from '../../../config/database';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

const router = Router();

router.use(authenticate);

const SYSTEM_METHODS: { code: string; label: string; sortOrder: number }[] = [
  { code: 'CASH', label: 'Especes', sortOrder: 0 },
  { code: 'MOBILE_MONEY', label: 'Mobile Money', sortOrder: 1 },
  { code: 'BANK_TRANSFER', label: 'Virement bancaire', sortOrder: 2 },
  { code: 'CARD', label: 'Carte bancaire', sortOrder: 3 },
  { code: 'CHECK', label: 'Cheque', sortOrder: 4 },
];

/**
 * Garantit la presence des methodes systeme pour l'organisation. Idempotent :
 * skip si deja existantes (unique sur (organizationId, code)).
 */
async function ensureSystemMethods(organizationId: string) {
  for (const m of SYSTEM_METHODS) {
    await prisma.paymentMethodConfig.upsert({
      where: { organizationId_code: { organizationId, code: m.code } },
      update: {},
      create: {
        organizationId,
        code: m.code,
        label: m.label,
        isSystem: true,
        isActive: true,
        sortOrder: m.sortOrder,
      },
    });
  }
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.user!.organizationId;
    await ensureSystemMethods(organizationId);
    const all = await prisma.paymentMethodConfig.findMany({
      where: { organizationId },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
    res.json({ success: true, data: all });
  } catch (err) { next(err); }
});

router.post(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user!.organizationId;
      const { code, label, color, icon, sortOrder } = req.body as Record<string, string | number>;
      if (!code || typeof code !== 'string' || !/^[A-Z0-9_]{2,40}$/.test(code as string)) {
        throw new BusinessError('Code invalide (2-40 caracteres, A-Z 0-9 _).');
      }
      if (!label || typeof label !== 'string' || (label as string).trim().length < 2) {
        throw new BusinessError('Libelle obligatoire (min 2 caracteres).');
      }
      const created = await prisma.paymentMethodConfig.create({
        data: {
          organizationId,
          code: (code as string).toUpperCase(),
          label: (label as string).trim(),
          color: (color as string)?.trim() || null,
          icon: (icon as string)?.trim() || null,
          sortOrder: Number(sortOrder ?? 100),
          isSystem: false,
          isActive: true,
        },
      });
      res.status(201).json({ success: true, data: created });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return next(new BusinessError('Une methode de paiement avec ce code existe deja.'));
      }
      next(err);
    }
  },
);

router.patch(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { label, color, icon, isActive, sortOrder } = req.body as Record<string, unknown>;
      const existing = await prisma.paymentMethodConfig.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new NotFoundError('Methode de paiement', req.params.id);
      const updated = await prisma.paymentMethodConfig.update({
        where: { id: req.params.id },
        data: {
          ...(typeof label === 'string' && { label: label.trim() }),
          ...(color !== undefined && { color: (color as string)?.trim() || null }),
          ...(icon !== undefined && { icon: (icon as string)?.trim() || null }),
          ...(typeof isActive === 'boolean' && { isActive }),
          ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
        },
      });
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },
);

router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.paymentMethodConfig.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new NotFoundError('Methode de paiement', req.params.id);
      if (existing.isSystem) {
        throw new BusinessError('Methode systeme non supprimable (deactivable seulement).');
      }
      // Refus si au moins un paiement (Payment ou DebtPayment) l'utilise.
      const [usedPayments, usedDebtPayments] = await Promise.all([
        prisma.payment.count({ where: { paymentMethod: existing.code } }),
        prisma.debtPayment.count({ where: { paymentMethod: existing.code } }),
      ]);
      const total = usedPayments + usedDebtPayments;
      if (total > 0) {
        throw new BusinessError(
          `Methode utilisee par ${total} paiement(s) existant(s). Suppression interdite : desactivez-la a la place.`,
        );
      }
      await prisma.paymentMethodConfig.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);

export default router;
