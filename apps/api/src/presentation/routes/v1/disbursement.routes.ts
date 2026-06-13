import { Router } from 'express';
import { DisbursementController } from '../../controllers/DisbursementController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { createDisbursementSchema, voidDisbursementSchema, paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Lecture des decaissements
router.get('/', validate(paginationSchema, 'query'), requirePermission('disbursement.read'), DisbursementController.list);
router.get('/:id', requirePermission('disbursement.read'), DisbursementController.getById);
// Creation d'un decaissement
router.post('/', validate(createDisbursementSchema), requirePermission('disbursement.create'), DisbursementController.create);
// Annulation d'un decaissement
router.post('/:id/void', authorize('SUPER_ADMIN', 'ADMIN'), requirePermission('disbursement.void'), validate(voidDisbursementSchema), DisbursementController.void);

export default router;
