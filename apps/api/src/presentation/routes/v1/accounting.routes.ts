import { Router } from 'express';
import { AccountingController } from '../../controllers/AccountingController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'));

// Lecture du journal comptable
router.get('/', validate(paginationSchema, 'query'), requirePermission('accounting.read'), AccountingController.getLedger);
router.get('/:id', requirePermission('accounting.read'), AccountingController.getEntry);

export default router;
