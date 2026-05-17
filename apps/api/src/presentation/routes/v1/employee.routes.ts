import { Router } from 'express';
import { EmployeeController } from '../../controllers/EmployeeController';
import {
  authenticate,
  authorize,
  requirePermission,
} from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { uploadImageMiddleware } from '../../middleware/upload';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Photos employes protegees par token (frontend utilise AuthedImage). Tout
// utilisateur authentifie avec une permission de lecture personnel y a acces.
router.get('/:id/image/:slot', EmployeeController.getImage);

// CRUD personnel : ABAC
router.get(
  '/',
  requirePermission('personnel.read'),
  validate(paginationSchema, 'query'),
  EmployeeController.listAll,
);

// Liste reduite des employes ayant une permission ABAC (cle ?key=...).
// IMPORTANT : declare avant /:id sinon "by-permission" est interprete comme id.
router.get(
  '/by-permission',
  requirePermission('personnel.read'),
  EmployeeController.byPermission,
);

router.get(
  '/agency/:agencyId',
  requirePermission('personnel.read'),
  validate(paginationSchema, 'query'),
  EmployeeController.list,
);
router.get('/:id', requirePermission('personnel.read'), EmployeeController.getById);
router.post('/', requirePermission('personnel.create'), EmployeeController.create);
router.patch('/:id', requirePermission('personnel.update'), EmployeeController.update);
router.delete('/:id', requirePermission('personnel.delete'), EmployeeController.delete);

// Paie
router.post('/:id/pay', requirePermission('payroll.pay'), EmployeeController.pay);
router.get('/:id/payslips', requirePermission('payslip.read'), EmployeeController.listPayslips);
router.get('/payslips/:payslipId/pdf', requirePermission('payslip.read'), EmployeeController.payslipPdf);

// Retenues sur salaire (motif obligatoire, ponctuelles)
router.get('/:id/deductions', requirePermission('payslip.read'), EmployeeController.listDeductions);
router.post('/:id/deductions', requirePermission('payroll.pay'), EmployeeController.createDeduction);
router.post('/deductions/:deductionId/cancel', requirePermission('payroll.pay'), EmployeeController.cancelDeduction);

// Documents employes (diplomes, contrats, certificats, ...)
router.get('/:id/documents', requirePermission('personnel.read'), EmployeeController.listDocuments);
router.post('/:id/documents', requirePermission('personnel.update'), EmployeeController.addDocument);
router.delete('/documents/:documentId', requirePermission('personnel.update'), EmployeeController.deleteDocument);

// Promotion / retrogradation chef d'agence
router.post('/:id/set-manager-flag', requirePermission('personnel.update'), EmployeeController.setManagerFlag);

// Planning hebdomadaire (shifts legacy : conserve le temps de la migration vers WorkSchedule)
router.get('/:id/shifts', requirePermission('personnel.read', 'schedule.manage'), EmployeeController.getShifts);
router.put('/:id/shifts', requirePermission('schedule.manage'), EmployeeController.setShifts);

// Pointage (attendance)
router.get('/:id/attendance', requirePermission('attendance.read'), EmployeeController.listAttendance);
router.post('/:id/attendance', requirePermission('attendance.mark'), EmployeeController.markAttendance);
router.post('/:id/attendance/check-out', requirePermission('attendance.mark'), EmployeeController.checkOut);
router.get('/:id/attendance/stats', requirePermission('attendance.read'), EmployeeController.attendanceStats);
router.get('/agency/:agencyId/attendance/today', requirePermission('attendance.read'), EmployeeController.listAgencyAttendance);

// Justifications
router.post(
  '/attendance/:attendanceId/justifications',
  requirePermission('attendance.justify'),
  EmployeeController.submitJustification,
);
router.post(
  '/justifications/:justificationId/review',
  requirePermission('attendance.justify.review'),
  EmployeeController.reviewJustification,
);
router.get(
  '/agency/:agencyId/justifications',
  requirePermission('attendance.justify.review'),
  EmployeeController.listAgencyJustifications,
);

// Conges
router.get('/:id/leaves', requirePermission('leave.read'), EmployeeController.listEmployeeLeaves);
router.post('/:id/leaves', requirePermission('leave.request', 'leave.validate'), EmployeeController.requestLeave);
router.post('/leaves/:leaveId/validate', requirePermission('leave.validate'), EmployeeController.validateLeave);
router.post('/leaves/:leaveId/cancel', requirePermission('leave.validate'), EmployeeController.cancelLeave);
router.post('/leaves/:leaveId/end-early', requirePermission('leave.end_early'), EmployeeController.endLeaveEarly);
router.get('/agency/:agencyId/leaves/pending', requirePermission('leave.validate'), EmployeeController.listAgencyPendingLeaves);

// Sanctions et rupture de contrat
router.get('/:id/sanctions', requirePermission('sanction.read'), EmployeeController.listSanctions);
router.post('/:id/sanctions', requirePermission('sanction.manage'), EmployeeController.createSanction);
router.post('/:id/terminate', requirePermission('personnel.delete'), EmployeeController.terminateContract);

// Evaluations
router.get('/:id/reviews', requirePermission('review.read'), EmployeeController.listReviews);
router.post('/:id/reviews', requirePermission('review.manage'), EmployeeController.createReview);
router.get('/agency/:agencyId/review-config', requirePermission('review.read'), EmployeeController.getAgencyReviewConfig);
router.put('/agency/:agencyId/review-config', requirePermission('review.manage'), EmployeeController.setAgencyReviewConfig);

// Stats RH + Rapport mensuel XLSX (legacy : reserve admin agence)
router.get('/agency/:agencyId/hr-stats', requirePermission('personnel.read'), EmployeeController.agencyHRStats);
router.get('/agency/:agencyId/hr-report.xlsx', requirePermission('personnel.read'), EmployeeController.agencyHRReportXlsx);

// Photo upload / delete (auth requise). slot in {selfie, locationPlan, idDocument, idDocumentBack}.
router.post('/:id/image/:slot', requirePermission('personnel.update'), uploadImageMiddleware, EmployeeController.uploadImage);
router.delete('/:id/image/:slot', requirePermission('personnel.update'), EmployeeController.deleteImage);

// authorize() conserve uniquement pour reference -- retire de toutes les routes ci-dessus.
// Le middleware ABAC requirePermission() prend le relais ; SUPER_ADMIN bypass automatique.
void authorize;

export default router;
