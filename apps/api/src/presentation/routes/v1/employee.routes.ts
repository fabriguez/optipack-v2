import { Router } from 'express';
import { EmployeeController } from '../../controllers/EmployeeController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@optipack/shared';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN'));

router.get('/agency/:agencyId', validate(paginationSchema, 'query'), EmployeeController.list);
router.get('/:id', EmployeeController.getById);
router.post('/', EmployeeController.create);
router.patch('/:id', EmployeeController.update);
router.delete('/:id', EmployeeController.delete);

export default router;
