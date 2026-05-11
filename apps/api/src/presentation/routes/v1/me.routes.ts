import { Router } from 'express';
import { MeController } from '../../controllers/MeController';
import { authenticate } from '../../middleware/authMiddleware';
import { prisma } from '../../../config/database';

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

// Preferences notification multi-canal (lecture/ecriture).
router.get('/notification-prefs', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { notificationPrefs: true },
    });
    res.json({ success: true, data: user?.notificationPrefs ?? {} });
  } catch (err) {
    next(err);
  }
});

router.put('/notification-prefs', async (req, res, next) => {
  try {
    // Validation legere : on attend un objet { [eventKind]: { channels: [...] } }.
    const body = req.body;
    if (body == null || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ success: false, message: 'Format invalide' });
    }
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { notificationPrefs: body },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
