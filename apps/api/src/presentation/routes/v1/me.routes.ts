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

// Profil self-service : l'utilisateur edite ses propres infos (nom, telephone,
// avatar). L'email n'est JAMAIS modifiable ici (identifiant de connexion +
// multi-tenant : changement = procedure admin). Le role/agences non plus.
router.put('/profile', async (req, res, next) => {
  try {
    const { firstName, lastName, phone, avatarUrl } = req.body ?? {};

    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);
    const fn = str(firstName);
    const ln = str(lastName);

    if (fn !== undefined && fn.length === 0) {
      return res.status(400).json({ success: false, message: 'Le prenom est requis' });
    }
    if (ln !== undefined && ln.length === 0) {
      return res.status(400).json({ success: false, message: 'Le nom est requis' });
    }

    const data: Record<string, unknown> = {};
    if (fn !== undefined) data.firstName = fn;
    if (ln !== undefined) data.lastName = ln;
    // phone et avatarUrl sont nullable : '' ou null => on efface.
    if (phone !== undefined) data.phone = str(phone) || null;
    if (avatarUrl !== undefined) data.avatarUrl = str(avatarUrl) || null;

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        role: true,
      },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

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
