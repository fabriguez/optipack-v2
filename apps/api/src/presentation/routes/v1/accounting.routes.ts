import { Router } from 'express';
import { AccountingController } from '../../controllers/AccountingController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);
// X1 : le garde de role legacy est retire — accounting.read (accorde aux postes
// Comptable ET Chef d'agence) est desormais le seul gardien. Cf. audit X1.

// Lecture du journal comptable
router.get('/', validate(paginationSchema, 'query'), requirePermission('accounting.read'), AccountingController.getLedger);
router.get('/:id', requirePermission('accounting.read'), AccountingController.getEntry);

export default router;
