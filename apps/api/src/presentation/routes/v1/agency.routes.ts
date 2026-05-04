import { Router } from 'express';
import { AgencyController } from '../../controllers/AgencyController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import {
  createAgencySchema,
  updateAgencySchema,
  paginationSchema,
  createAgencyChargeSchema,
  updateAgencyChargeSchema,
  payAgencyChargeSchema,
} from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), AgencyController.list);
router.get('/:id', AgencyController.getById);
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), validate(createAgencySchema), AgencyController.create);
router.patch('/:id', authorize('SUPER_ADMIN', 'ADMIN'), validate(updateAgencySchema), AgencyController.update);
router.delete('/:id', authorize('SUPER_ADMIN'), AgencyController.delete);

// Charges recurrentes (eau, electricite, loyer, salaires, ...)
router.get('/:id/charges', AgencyController.listCharges);
router.post(
  '/:id/charges',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  validate(createAgencyChargeSchema),
  AgencyController.createCharge,
);
router.patch(
  '/charges/:chargeId',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  validate(updateAgencyChargeSchema),
  AgencyController.updateCharge,
);
router.delete(
  '/charges/:chargeId',
  authorize('SUPER_ADMIN', 'ADMIN'),
  AgencyController.deleteCharge,
);
router.post(
  '/charges/:chargeId/pay',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  validate(payAgencyChargeSchema),
  AgencyController.payCharge,
);

export default router;
