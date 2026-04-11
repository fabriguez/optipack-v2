import { Router } from 'express';
import { WarehouseController } from '../../controllers/WarehouseController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@optipack/shared';

const router = Router();

router.use(authenticate);

router.get('/agency/:agencyId', validate(paginationSchema, 'query'), WarehouseController.list);
router.get('/:id', WarehouseController.getById);
router.post('/', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), WarehouseController.create);
router.patch('/:id', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), WarehouseController.update);
router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), WarehouseController.delete);

export default router;
