import { Router } from 'express';
import { DisbursementController } from '../../controllers/DisbursementController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { createDisbursementSchema, voidDisbursementSchema, paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), DisbursementController.list);
router.get('/:id', DisbursementController.getById);
router.post('/', validate(createDisbursementSchema), DisbursementController.create);
router.post('/:id/void', authorize('SUPER_ADMIN', 'ADMIN'), validate(voidDisbursementSchema), DisbursementController.void);

export default router;
