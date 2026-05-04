import { Router } from 'express';
import { AgencyController } from '../../controllers/AgencyController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { uploadImageMiddleware } from '../../middleware/upload';
import {
  createAgencySchema,
  updateAgencySchema,
  paginationSchema,
  createAgencyChargeSchema,
  updateAgencyChargeSchema,
  payAgencyChargeSchema,
} from '@transitsoftservices/shared';

const router = Router();

// Endpoint PUBLIC : sert l'image agence pour <img src>. Doit etre AVANT authenticate.
router.get('/:id/image', AgencyController.getImage);

// Lecture des horaires d'ouverture (publique pour pouvoir afficher les agences sur le portail client)
router.get('/:id/opening-hours', AgencyController.listOpeningHours);

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

// Image upload / delete (auth requise)
router.post(
  '/:id/image',
  authorize('SUPER_ADMIN', 'ADMIN'),
  uploadImageMiddleware,
  AgencyController.uploadImage,
);
router.delete(
  '/:id/image',
  authorize('SUPER_ADMIN', 'ADMIN'),
  AgencyController.deleteImage,
);

// Mise a jour complete des horaires d'ouverture (replace-all)
router.put(
  '/:id/opening-hours',
  authorize('SUPER_ADMIN', 'ADMIN'),
  AgencyController.setOpeningHours,
);

export default router;
