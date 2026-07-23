import { Router } from 'express';
import { PenaltyController } from '../../controllers/PenaltyController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Lecture des penalites
router.get('/', validate(paginationSchema, 'query'), requirePermission('penalty.read'), PenaltyController.list);
router.get('/:id', requirePermission('penalty.read'), PenaltyController.getById);
// Calcul = creation/mise a jour de penalites, donc gestion
// X1 : penalty.manage (Chef d'agence) est le seul gardien.
router.post('/calculate', requirePermission('penalty.manage'), PenaltyController.calculate);

export default router;
