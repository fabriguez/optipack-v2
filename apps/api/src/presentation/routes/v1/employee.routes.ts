import { Router } from 'express';
import { EmployeeController } from '../../controllers/EmployeeController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { uploadImageMiddleware } from '../../middleware/upload';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Photos employes protegees par token (frontend utilise AuthedImage).
router.get('/:id/image/:slot', EmployeeController.getImage);
router.use(authorize('SUPER_ADMIN', 'ADMIN'));

router.get('/', validate(paginationSchema, 'query'), EmployeeController.listAll);
router.get('/agency/:agencyId', validate(paginationSchema, 'query'), EmployeeController.list);
router.get('/:id', EmployeeController.getById);
router.post('/', EmployeeController.create);
router.patch('/:id', EmployeeController.update);
router.delete('/:id', EmployeeController.delete);

// Paiement effectif depuis une caisse (Expense + DisbursementVoucher + Payslip + debit caisse)
router.post('/:id/pay', EmployeeController.pay);
router.get('/:id/payslips', EmployeeController.listPayslips);

// Retenues sur salaire (motif obligatoire, ponctuelles)
router.get('/:id/deductions', EmployeeController.listDeductions);
router.post('/:id/deductions', EmployeeController.createDeduction);
router.post('/deductions/:deductionId/cancel', EmployeeController.cancelDeduction);

// Documents employes (diplomes, contrats, certificats, ...)
router.get('/:id/documents', EmployeeController.listDocuments);
router.post('/:id/documents', EmployeeController.addDocument);
router.delete('/documents/:documentId', EmployeeController.deleteDocument);

// Promotion / retrogradation chef d'agence
router.post('/:id/set-manager-flag', EmployeeController.setManagerFlag);

// Planning hebdomadaire (shifts)
router.get('/:id/shifts', EmployeeController.getShifts);
router.put('/:id/shifts', EmployeeController.setShifts);

// Pointage (attendance)
router.get('/:id/attendance', EmployeeController.listAttendance);
router.post('/:id/attendance', EmployeeController.markAttendance);
router.get('/agency/:agencyId/attendance/today', EmployeeController.listAgencyAttendance);

// Conges
router.get('/:id/leaves', EmployeeController.listEmployeeLeaves);
router.post('/:id/leaves', EmployeeController.requestLeave);
router.post('/leaves/:leaveId/validate', EmployeeController.validateLeave);
router.post('/leaves/:leaveId/cancel', EmployeeController.cancelLeave);
router.get('/agency/:agencyId/leaves/pending', EmployeeController.listAgencyPendingLeaves);

// Sanctions et rupture de contrat
router.get('/:id/sanctions', EmployeeController.listSanctions);
router.post('/:id/sanctions', EmployeeController.createSanction);
router.post('/:id/terminate', EmployeeController.terminateContract);

// Evaluations
router.get('/:id/reviews', EmployeeController.listReviews);
router.post('/:id/reviews', EmployeeController.createReview);
router.get('/agency/:agencyId/review-config', EmployeeController.getAgencyReviewConfig);
router.put('/agency/:agencyId/review-config', EmployeeController.setAgencyReviewConfig);

// Stats RH + Rapport mensuel XLSX
router.get('/agency/:agencyId/hr-stats', EmployeeController.agencyHRStats);
router.get('/agency/:agencyId/hr-report.xlsx', EmployeeController.agencyHRReportXlsx);

// Photo upload / delete (auth requise). slot in {selfie, locationPlan, idDocument, idDocumentBack}.
router.post('/:id/image/:slot', uploadImageMiddleware, EmployeeController.uploadImage);
router.delete('/:id/image/:slot', EmployeeController.deleteImage);

export default router;
