import { Router } from 'express';
import { TransitRouteController } from '../../controllers/TransitRouteController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { createTransitRouteSchema, updateTransitRouteSchema, paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('transitroute.read'), validate(paginationSchema, 'query'), TransitRouteController.list);
router.get('/active', requirePermission('transitroute.read'), TransitRouteController.getActive);
router.get('/:id', requirePermission('transitroute.read'), TransitRouteController.getById);
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), requirePermission('transitroute.manage'), validate(createTransitRouteSchema), TransitRouteController.create);
router.patch('/:id', authorize('SUPER_ADMIN', 'ADMIN'), requirePermission('transitroute.manage'), validate(updateTransitRouteSchema), TransitRouteController.update);
router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), requirePermission('transitroute.manage'), TransitRouteController.delete);

export default router;
