import { Router } from 'express';
import { DebtController } from '../../controllers/DebtController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
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

// X1 : les gardes de role legacy sont retires — la permission dediee est le
// seul gardien (debt.pay accorde a Agent/Chef/Comptable ; debt.void/debt.update
// accordes a Comptable, que authorize('ADMIN') bloquait a tort).
router.post(
  '/:id/payments',
  requirePermission('debt.pay'),
  validate(recordDebtPaymentSchema),
  DebtController.recordPayment,
);

router.post(
  '/:id/void',
  requirePermission('debt.void'),
  validate(voidDebtSchema),
  DebtController.voidDebt,
);

router.post(
  '/:id/adjust',
  requirePermission('debt.update'),
  validate(adjustDebtSchema),
  DebtController.adjust,
);

router.post(
  '/:id/litigated',
  requirePermission('debt.update'),
  validate(markDebtLitigatedSchema),
  DebtController.markLitigated,
);

export default router;
