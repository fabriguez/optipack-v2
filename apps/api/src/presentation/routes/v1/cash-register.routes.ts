import { Router } from 'express';
import { CashRegisterController } from '../../controllers/CashRegisterController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

// Lecture de l'etat et des mouvements de caisse
router.get('/:agencyId', requirePermission('cashregister.read'), CashRegisterController.get);
router.get('/:agencyId/movements', requirePermission('cashregister.read'), CashRegisterController.movements);
// Seul ADMIN+ ou SUPERVISEUR peut cloturer
router.post('/:agencyId/close', authorize('SUPER_ADMIN', 'ADMIN', 'SUPERVISEUR'), requirePermission('cashregister.close'), CashRegisterController.close);

export default router;
