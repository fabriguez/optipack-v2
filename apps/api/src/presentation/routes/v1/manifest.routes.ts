import { Router } from 'express';
import { ManifestController } from '../../controllers/ManifestController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), ManifestController.list);
router.get('/comparison/:containerId', ManifestController.getComparison);
router.get('/comparison/:containerId/pdf', ManifestController.getComparisonPDF);
router.get('/discrepancies/:containerId', ManifestController.listDiscrepancies);
router.post(
  '/discrepancies/:containerId',
  authorize('SUPER_ADMIN', 'ADMIN'),
  ManifestController.addDiscrepancy,
);
router.delete(
  '/discrepancies/:containerId/:discrepancyId',
  authorize('SUPER_ADMIN', 'ADMIN'),
  ManifestController.removeDiscrepancy,
);
// Enregistrement complet d'un colis trouve physiquement (EXTRA_PHYSICAL).
// Cree un vrai Parcel + lie une discrepancy au container pour audit.
router.post(
  '/discrepancies/:containerId/register-extra',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  ManifestController.registerExtraParcel,
);
router.get('/:id', ManifestController.getById);
router.get('/:id/pdf', ManifestController.getPDF);
router.get('/:id/xlsx', ManifestController.getXLSX);
router.post(
  '/dispatch/:containerId',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'),
  ManifestController.createDispatch,
);
router.post(
  '/reception/:containerId',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'),
  ManifestController.createReception,
);

export default router;
