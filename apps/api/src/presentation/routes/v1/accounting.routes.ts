import { Router } from 'express';
import { AccountingController } from '../../controllers/AccountingController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'));

router.get('/', validate(paginationSchema, 'query'), AccountingController.getLedger);
router.get('/:id', AccountingController.getEntry);

export default router;
