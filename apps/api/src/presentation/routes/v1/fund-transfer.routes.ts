import { Router } from 'express';
import { FundTransferController } from '../../controllers/FundTransferController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { createFundTransferSchema, paginationSchema } from '@optipack/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), FundTransferController.list);
router.get('/:id', FundTransferController.getById);
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), validate(createFundTransferSchema), FundTransferController.create);
router.post('/:id/confirm', authorize('SUPER_ADMIN', 'ADMIN'), FundTransferController.confirm);

export default router;
