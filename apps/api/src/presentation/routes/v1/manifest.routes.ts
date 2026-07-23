import { Router } from 'express';
import { ManifestController } from '../../controllers/ManifestController';
// X1 : gardes de role legacy retires — manifest.read/manifest.manage (accordes
// aux postes logistiques : Chef, Magasinier, Logisticien) sont les seuls gardiens.
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Lecture des manifestes et ecarts
router.get('/', validate(paginationSchema, 'query'), requirePermission('manifest.read'), ManifestController.list);
router.get('/comparison/:containerId', requirePermission('manifest.read'), ManifestController.getComparison);
router.get('/comparison/:containerId/pdf', requirePermission('manifest.read'), ManifestController.getComparisonPDF);
router.get('/discrepancies/:containerId', requirePermission('manifest.read'), ManifestController.listDiscrepancies);
router.post(
  '/discrepancies/:containerId',
  requirePermission('manifest.manage'),
  ManifestController.addDiscrepancy,
);
router.delete(
  '/discrepancies/:containerId/:discrepancyId',
  requirePermission('manifest.manage'),
  ManifestController.removeDiscrepancy,
);
// Enregistrement complet d'un colis trouve physiquement (EXTRA_PHYSICAL).
// Cree un vrai Parcel + lie une discrepancy au container pour audit.
router.post(
  '/discrepancies/:containerId/register-extra',
  requirePermission('manifest.manage'),
  ManifestController.registerExtraParcel,
);
// Marque un colis declare comme NON RECU physiquement (MISSING_PHYSICAL).
router.post(
  '/discrepancies/:containerId/parcels/:parcelId/missing',
  requirePermission('manifest.manage'),
  ManifestController.markParcelMissing,
);
router.get('/:id', requirePermission('manifest.read'), ManifestController.getById);
router.get('/:id/pdf', requirePermission('manifest.read'), ManifestController.getPDF);
router.get('/:id/xlsx', requirePermission('manifest.read'), ManifestController.getXLSX);
router.post(
  '/dispatch/:containerId',
  requirePermission('manifest.manage'),
  ManifestController.createDispatch,
);
router.post(
  '/reception/:containerId',
  requirePermission('manifest.manage'),
  ManifestController.createReception,
);

export default router;
