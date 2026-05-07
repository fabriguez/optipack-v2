import { Router } from 'express';
import { ParcelGroupController } from '../../controllers/ParcelGroupController';
import { authenticate, authorize } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', ParcelGroupController.list);
router.get('/:id', ParcelGroupController.get);
router.post('/', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'), ParcelGroupController.create);
router.post('/:id/parcels', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'), ParcelGroupController.addParcel);
router.post('/:id/invoice', authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'), ParcelGroupController.generateInvoice);
router.post('/:id/send-invoice', authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'), ParcelGroupController.sendInvoice);

export default router;
