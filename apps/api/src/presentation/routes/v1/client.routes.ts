import { Router } from 'express';
import { ClientController } from '../../controllers/ClientController';
import { PartnerPricingController } from '../../controllers/PartnerPricingController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { createClientSchema, updateClientSchema, paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), ClientController.list);
router.get('/:id', ClientController.getById);
router.post('/', validate(createClientSchema), ClientController.create);
router.patch('/:id', validate(updateClientSchema), ClientController.update);
router.delete('/:id', ClientController.delete);

// Tarification partenaire
router.get('/:clientId/pricings', PartnerPricingController.list);
router.post(
  '/:clientId/pricings',
  authorize('SUPER_ADMIN', 'ADMIN'),
  PartnerPricingController.create,
);
router.patch(
  '/pricings/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  PartnerPricingController.update,
);
router.delete(
  '/pricings/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  PartnerPricingController.remove,
);

export default router;
