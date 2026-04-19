import { Router } from 'express';
import { LoyaltyController } from '../../controllers/LoyaltyController';
import { authenticate } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/client/:clientId', validate(paginationSchema, 'query'), LoyaltyController.getByClient);
router.get('/client/:clientId/points', LoyaltyController.getPoints);

export default router;
