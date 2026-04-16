import { Router } from 'express';
import { ReportController } from '../../controllers/ReportController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@optipack/shared';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'));

router.get('/parcels', validate(paginationSchema, 'query'), ReportController.parcels);
router.get('/payments', validate(paginationSchema, 'query'), ReportController.payments);
router.get('/revenue', validate(paginationSchema, 'query'), ReportController.revenue);
router.get('/debts', validate(paginationSchema, 'query'), ReportController.debts);
router.get('/cash-flow', validate(paginationSchema, 'query'), ReportController.cashFlow);
router.get('/penalties', validate(paginationSchema, 'query'), ReportController.penalties);

export default router;
