import { Router } from 'express';
import { PenaltyController } from '../../controllers/PenaltyController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Lecture des penalites
router.get('/', validate(paginationSchema, 'query'), requirePermission('penalty.read'), PenaltyController.list);
router.get('/:id', requirePermission('penalty.read'), PenaltyController.getById);
// Calcul = creation/mise a jour de penalites, donc gestion
router.post('/calculate', authorize('SUPER_ADMIN', 'ADMIN'), requirePermission('penalty.manage'), PenaltyController.calculate);

export default router;
