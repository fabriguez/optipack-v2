import { Router } from 'express';
import { CashRegisterController } from '../../controllers/CashRegisterController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

// Lecture de l'etat et des mouvements de caisse
router.get('/:agencyId', requirePermission('cashregister.read'), CashRegisterController.get);
router.get('/:agencyId/movements', requirePermission('cashregister.read'), CashRegisterController.movements);
// Seul ADMIN+ ou SUPERVISEUR peut cloturer
// X1 : cashregister.close (Chef, Superviseur, Comptable) est le seul gardien.
router.post('/:agencyId/close', requirePermission('cashregister.close'), CashRegisterController.close);

export default router;
