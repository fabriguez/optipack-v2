import { Router } from 'express';
import { DashboardController } from '../../controllers/DashboardController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/stats', requirePermission('dashboard.read'), DashboardController.getStats);

export default router;
