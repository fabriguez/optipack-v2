import { Router } from 'express';
import { FinanceController } from '../../controllers/FinanceController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/timeline', FinanceController.timeline);

export default router;
