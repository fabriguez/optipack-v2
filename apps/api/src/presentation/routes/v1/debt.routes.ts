import { Router } from 'express';
import { DebtController } from '../../controllers/DebtController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import {
  paginationSchema,
  createDebtSchema,
  recordDebtPaymentSchema,
  voidDebtSchema,
  adjustDebtSchema,
  markDebtLitigatedSchema,
} from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('debt.read'), validate(paginationSchema, 'query'), DebtController.list);
router.get('/:id', requirePermission('debt.read'), DebtController.getById);
router.get('/client/:clientId', requirePermission('debt.read'), DebtController.getByClient);
router.post('/', requirePermission('debt.create'), validate(createDebtSchema), DebtController.create);

// Paiement d'une dette : permission cassiere / agent / admin.
router.post(
  '/:id/payments',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'),
  requirePermission('debt.pay'),
  validate(recordDebtPaymentSchema),
  DebtController.recordPayment,
);

// Annulation : admin uniquement.
router.post(
  '/:id/void',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('debt.void'),
  validate(voidDebtSchema),
  DebtController.voidDebt,
);

// Ajustement du montant ou de l'echeance : admin uniquement.
router.post(
  '/:id/adjust',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('debt.update'),
  validate(adjustDebtSchema),
  DebtController.adjust,
);

// Bascule en LITIGATED : admin uniquement.
router.post(
  '/:id/litigated',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('debt.update'),
  validate(markDebtLitigatedSchema),
  DebtController.markLitigated,
);

export default router;
