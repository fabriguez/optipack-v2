import { Router } from 'express';
import { CashRegisterController } from '../../controllers/CashRegisterController';
import { authenticate, authorize } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/:agencyId', CashRegisterController.get);
router.get('/:agencyId/movements', CashRegisterController.movements);
// Seul ADMIN+ ou SUPERVISEUR peut cloturer
router.post('/:agencyId/close', authorize('SUPER_ADMIN', 'ADMIN', 'SUPERVISEUR'), CashRegisterController.close);

export default router;
