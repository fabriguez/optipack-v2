import { Router } from 'express';
import { RoutingController } from '../../controllers/RoutingController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/container/:containerId', requirePermission('container.read'), RoutingController.listByContainer);
router.get('/parcel/:parcelId', requirePermission('container.read'), RoutingController.listByParcel);
router.post('/redistribute/:containerId', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), requirePermission('container.manage'), RoutingController.redistribute);

export default router;
