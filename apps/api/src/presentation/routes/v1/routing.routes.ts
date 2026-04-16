import { Router } from 'express';
import { RoutingController } from '../../controllers/RoutingController';
import { authenticate, authorize } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/container/:containerId', RoutingController.listByContainer);
router.get('/parcel/:parcelId', RoutingController.listByParcel);
router.post('/redistribute/:containerId', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), RoutingController.redistribute);

export default router;
