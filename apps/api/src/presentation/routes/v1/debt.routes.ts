import { Router } from 'express';
import { DebtController } from '../../controllers/DebtController';
import { authenticate } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), DebtController.list);
router.get('/:id', DebtController.getById);
router.get('/client/:clientId', DebtController.getByClient);
router.post('/', DebtController.create);

export default router;
