import { Router } from 'express';
import { MeController } from '../../controllers/MeController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/employee', MeController.getEmployee);
router.get('/attendance', MeController.listMyAttendance);
router.get('/leaves', MeController.listMyLeaves);
router.post('/leaves', MeController.requestMyLeave);
router.get('/payslips', MeController.listMyPayslips);
router.get('/shifts', MeController.listMyShifts);
router.get('/documents', MeController.listMyDocuments);
router.get('/sanctions', MeController.listMySanctions);

export default router;
