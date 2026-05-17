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

router.use(authenticate);

// L'image agence est protegee par le token (front-end utilise AuthedImage).
router.get('/:id/image', AgencyController.getImage);

// Lecture des horaires d'ouverture
router.get('/:id/opening-hours', AgencyController.listOpeningHours);

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

// Documents et historique des charges
router.get('/charges/:chargeId/documents', AgencyController.listChargeDocuments);
router.post(
  '/charges/:chargeId/documents',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  AgencyController.addChargeDocument,
);
router.delete(
  '/charges/:chargeId/documents/:documentId',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  AgencyController.deleteChargeDocument,
);
router.get('/charges/:chargeId/history', AgencyController.listChargeHistory);

// PDF du rapport journalier (header + footer aux couleurs du tenant)
router.get('/daily-reports/:reportId/pdf', AgencyController.getDailyReportPDF);

// Mise a jour du libelle d'une piece jointe d'un rapport journalier.
router.patch(
  '/daily-reports/:reportId/attachments/:attachmentId',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  AgencyController.updateDailyReportAttachment,
);

// Breakdowns financiers (paiements par route+methode, decaissements par categorie)
router.get('/:id/breakdown', AgencyController.breakdown);

// Rapports journaliers (auto + observations)
router.get('/:id/daily-reports', AgencyController.listDailyReports);
router.post(
  '/:id/daily-reports',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  AgencyController.generateDailyReport,
);
router.get('/daily-reports/:reportId', AgencyController.getDailyReport);
router.patch(
  '/daily-reports/:reportId',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  AgencyController.updateDailyReportObservation,
);
router.post(
  '/daily-reports/:reportId/attachments',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  AgencyController.addDailyReportAttachment,
);
router.delete(
  '/daily-reports/:reportId/attachments/:attachmentId',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  AgencyController.deleteDailyReportAttachment,
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
