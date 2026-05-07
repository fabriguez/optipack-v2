import { Router } from 'express';
import { WorkScheduleController } from '../../controllers/WorkScheduleController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { tenantGuard } from '../../middleware/tenantGuard';

const router = Router();

router.use(authenticate, tenantGuard);

router.get('/', requirePermission('schedule.manage', 'personnel.read'), WorkScheduleController.list);
router.get('/:id', requirePermission('schedule.manage', 'personnel.read'), WorkScheduleController.getById);
router.post('/', requirePermission('schedule.manage'), WorkScheduleController.create);
router.patch('/:id', requirePermission('schedule.manage'), WorkScheduleController.update);
router.delete('/:id', requirePermission('schedule.manage'), WorkScheduleController.delete);
router.put('/:id/days', requirePermission('schedule.manage'), WorkScheduleController.setDays);

// Assignations (utiliser scheduleId="null" pour detacher).
router.put('/agencies/:agencyId/assign/:scheduleId', requirePermission('schedule.manage'), WorkScheduleController.assignToAgency);
router.put('/employees/:employeeId/assign/:scheduleId', requirePermission('schedule.manage'), WorkScheduleController.assignToEmployee);

export default router;
