import { Router } from 'express';
import { ExpenseController } from '../../controllers/ExpenseController';
import { authenticate } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), ExpenseController.list);
router.get('/container/:containerId', ExpenseController.listForContainer);
router.post('/container/:containerId', ExpenseController.createForContainer);
router.post('/:id/pay', ExpenseController.pay);
router.get('/:id', ExpenseController.getById);
router.post('/', ExpenseController.create);

export default router;
