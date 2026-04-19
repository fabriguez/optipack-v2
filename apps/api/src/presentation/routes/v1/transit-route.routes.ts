import { Router } from 'express';
import { TransitRouteController } from '../../controllers/TransitRouteController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { createTransitRouteSchema, updateTransitRouteSchema, paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), TransitRouteController.list);
router.get('/active', TransitRouteController.getActive);
router.get('/:id', TransitRouteController.getById);
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), validate(createTransitRouteSchema), TransitRouteController.create);
router.patch('/:id', authorize('SUPER_ADMIN', 'ADMIN'), validate(updateTransitRouteSchema), TransitRouteController.update);
router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), TransitRouteController.delete);

export default router;
