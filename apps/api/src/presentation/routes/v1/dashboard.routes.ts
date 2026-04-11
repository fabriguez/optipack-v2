import { Router } from 'express';
import { DashboardController } from '../../controllers/DashboardController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/stats', DashboardController.getStats);

export default router;
