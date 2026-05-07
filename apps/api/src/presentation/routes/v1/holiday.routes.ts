import { Router } from 'express';
import { HolidayController } from '../../controllers/HolidayController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { tenantGuard } from '../../middleware/tenantGuard';

const router = Router();

router.use(authenticate, tenantGuard);

router.get('/', requirePermission('holiday.manage', 'personnel.read'), HolidayController.list);
router.post('/', requirePermission('holiday.manage'), HolidayController.create);
router.delete('/:id', requirePermission('holiday.manage'), HolidayController.delete);

export default router;
