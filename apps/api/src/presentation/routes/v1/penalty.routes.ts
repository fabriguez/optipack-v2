import { Router } from 'express';
import { PenaltyController } from '../../controllers/PenaltyController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), PenaltyController.list);
router.get('/:id', PenaltyController.getById);
router.post('/calculate', authorize('SUPER_ADMIN', 'ADMIN'), PenaltyController.calculate);

export default router;
