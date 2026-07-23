import { Router } from 'express';
import { RoutingController } from '../../controllers/RoutingController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/container/:containerId', requirePermission('container.read'), RoutingController.listByContainer);
router.get('/parcel/:parcelId', requirePermission('container.read'), RoutingController.listByParcel);
// X1 : container.manage (Chef, Magasinier, Logisticien) est le seul gardien.
router.post('/redistribute/:containerId', requirePermission('container.manage'), RoutingController.redistribute);

export default router;
