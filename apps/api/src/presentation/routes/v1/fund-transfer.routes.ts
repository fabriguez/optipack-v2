import { Router } from 'express';
import { FundTransferController } from '../../controllers/FundTransferController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { createFundTransferSchema, paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Lecture des transferts de fonds
router.get('/', validate(paginationSchema, 'query'), requirePermission('transfer.read'), FundTransferController.list);
router.get('/:id', requirePermission('transfer.read'), FundTransferController.getById);
// Initiation d'un transfert
router.post('/', requirePermission('transfer.initiate'), validate(createFundTransferSchema), FundTransferController.create);
// Confirmation / annulation d'un transfert
router.post('/:id/confirm', requirePermission('transfer.confirm'), FundTransferController.confirm);
router.post('/:id/void', requirePermission('transfer.void'), FundTransferController.void);

export default router;
