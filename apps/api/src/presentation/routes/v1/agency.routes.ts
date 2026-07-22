import { Router } from 'express';
import { AgencyController } from '../../controllers/AgencyController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
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

// Permissions ABAC : lecture agence, gestion agence / charges / rapports.

// L'image agence est protegee par le token (front-end utilise AuthedImage).
router.get('/:id/image', requirePermission('agency.read'), AgencyController.getImage);

// Lecture des horaires d'ouverture
router.get('/:id/opening-hours', requirePermission('agency.read'), AgencyController.listOpeningHours);

router.get('/', requirePermission('agency.read'), validate(paginationSchema, 'query'), AgencyController.list);
router.get('/:id', requirePermission('agency.read'), AgencyController.getById);
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), requirePermission('agency.manage'), validate(createAgencySchema), AgencyController.create);
router.patch('/:id', authorize('SUPER_ADMIN', 'ADMIN'), requirePermission('agency.manage'), validate(updateAgencySchema), AgencyController.update);
router.delete('/:id', authorize('SUPER_ADMIN'), requirePermission('agency.manage'), AgencyController.delete);

// Charges recurrentes (eau, electricite, loyer, salaires, ...)
router.get('/:id/charges', requirePermission('agency.read'), AgencyController.listCharges);
router.post(
  '/:id/charges',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  requirePermission('charge.manage'),
  validate(createAgencyChargeSchema),
  AgencyController.createCharge,
);
router.patch(
  '/charges/:chargeId',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  requirePermission('charge.manage'),
  validate(updateAgencyChargeSchema),
  AgencyController.updateCharge,
);
router.delete(
  '/charges/:chargeId',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('charge.manage'),
  AgencyController.deleteCharge,
);
router.post(
  '/charges/:chargeId/pay',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  requirePermission('charge.manage'),
  validate(payAgencyChargeSchema),
  AgencyController.payCharge,
);

// Documents et historique des charges
router.get('/charges/:chargeId/documents', requirePermission('agency.read'), AgencyController.listChargeDocuments);
router.post(
  '/charges/:chargeId/documents',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  requirePermission('charge.manage'),
  AgencyController.addChargeDocument,
);
router.delete(
  '/charges/:chargeId/documents/:documentId',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  requirePermission('charge.manage'),
  AgencyController.deleteChargeDocument,
);
router.get('/charges/:chargeId/history', requirePermission('agency.read'), AgencyController.listChargeHistory);

// PDF du rapport journalier (header + footer aux couleurs du tenant)
router.get('/daily-reports/:reportId/pdf', requirePermission('dailyreport.read'), AgencyController.getDailyReportPDF);

// Mise a jour du libelle d'une piece jointe d'un rapport journalier.
router.patch(
  '/daily-reports/:reportId/attachments/:attachmentId',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  requirePermission('dailyreport.manage'),
  AgencyController.updateDailyReportAttachment,
);

// Breakdowns financiers (paiements par route+methode, decaissements par categorie)
router.get('/:id/breakdown', requirePermission('agency.read'), AgencyController.breakdown);

// Rapports journaliers (auto + observations)
router.get('/:id/daily-reports', requirePermission('dailyreport.read'), AgencyController.listDailyReports);
router.post(
  '/:id/daily-reports',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  requirePermission('dailyreport.manage'),
  AgencyController.generateDailyReport,
);
router.get('/daily-reports/:reportId', requirePermission('dailyreport.read'), AgencyController.getDailyReport);
router.patch(
  '/daily-reports/:reportId',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  requirePermission('dailyreport.manage'),
  AgencyController.updateDailyReportObservation,
);
router.post(
  '/daily-reports/:reportId/attachments',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  requirePermission('dailyreport.manage'),
  AgencyController.addDailyReportAttachment,
);
router.delete(
  '/daily-reports/:reportId/attachments/:attachmentId',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  requirePermission('dailyreport.manage'),
  AgencyController.deleteDailyReportAttachment,
);

// Renvoi manuel du rapport journalier par email (idempotent : met a jour
// emailedAt + emailSentTo a chaque appel).
router.post(
  '/daily-reports/:reportId/email',
  authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'),
  requirePermission('dailyreport.manage'),
  AgencyController.resendDailyReportEmail,
);

// Image upload / delete (auth requise)
router.post(
  '/:id/image',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('agency.manage'),
  uploadImageMiddleware,
  AgencyController.uploadImage,
);
router.delete(
  '/:id/image',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('agency.manage'),
  AgencyController.deleteImage,
);

// Mise a jour complete des horaires d'ouverture (replace-all)
router.put(
  '/:id/opening-hours',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('agency.manage'),
  AgencyController.setOpeningHours,
);

export default router;
