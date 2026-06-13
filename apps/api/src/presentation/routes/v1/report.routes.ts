import { Router } from 'express';
import { ReportController } from '../../controllers/ReportController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'));

router.get('/parcels', requirePermission('report.read'), validate(paginationSchema, 'query'), ReportController.parcels);
router.get('/payments', requirePermission('report.read'), validate(paginationSchema, 'query'), ReportController.payments);
router.get('/revenue', requirePermission('report.read'), validate(paginationSchema, 'query'), ReportController.revenue);
router.get('/debts', requirePermission('report.read'), validate(paginationSchema, 'query'), ReportController.debts);
router.get('/cash-flow', requirePermission('report.read'), validate(paginationSchema, 'query'), ReportController.cashFlow);
router.get('/penalties', requirePermission('report.read'), validate(paginationSchema, 'query'), ReportController.penalties);

export default router;
