import { Router } from 'express';
import { ClientController } from '../../controllers/ClientController';
import { PartnerPricingController } from '../../controllers/PartnerPricingController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { uploadImageMiddleware } from '../../middleware/upload';
import { createClientSchema, updateClientSchema, paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), ClientController.list);
router.get('/:id', ClientController.getById);
router.post('/', validate(createClientSchema), ClientController.create);
router.patch('/:id', validate(updateClientSchema), ClientController.update);
router.delete('/:id', ClientController.delete);

// Photos client : slot in {profile, idDocument, idDocumentBack}
router.get('/:id/image/:slot', ClientController.getImage);
router.post('/:id/image/:slot', uploadImageMiddleware, ClientController.uploadImage);
router.delete('/:id/image/:slot', ClientController.deleteImage);

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
