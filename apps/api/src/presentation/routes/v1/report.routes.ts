import { Router } from 'express';
import { ReportController } from '../../controllers/ReportController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);
// X1 : garde de role legacy retire — report.read (accorde a Comptable ET Chef
// d'agence) est le seul gardien. Les agregats sont deja scopes par agence. Cf. audit X1.

router.get('/parcels', requirePermission('report.read'), validate(paginationSchema, 'query'), ReportController.parcels);
router.get('/payments', requirePermission('report.read'), validate(paginationSchema, 'query'), ReportController.payments);
router.get('/revenue', requirePermission('report.read'), validate(paginationSchema, 'query'), ReportController.revenue);
router.get('/debts', requirePermission('report.read'), validate(paginationSchema, 'query'), ReportController.debts);
router.get('/cash-flow', requirePermission('report.read'), validate(paginationSchema, 'query'), ReportController.cashFlow);
router.get('/penalties', requirePermission('report.read'), validate(paginationSchema, 'query'), ReportController.penalties);

export default router;
