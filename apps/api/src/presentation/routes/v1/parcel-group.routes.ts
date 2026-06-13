import { Router } from 'express';
import { ParcelGroupController } from '../../controllers/ParcelGroupController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('parcel.read'), ParcelGroupController.list);
router.get('/:id', requirePermission('parcel.read'), ParcelGroupController.get);
router.post('/', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'), requirePermission('parcelgroup.manage'), ParcelGroupController.create);
router.post('/:id/parcels', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'), requirePermission('parcelgroup.manage'), ParcelGroupController.addParcel);
router.post('/:id/invoice', authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'), requirePermission('parcelgroup.manage'), ParcelGroupController.generateInvoice);
router.post('/:id/send-invoice', authorize('SUPER_ADMIN', 'ADMIN', 'COMPTABLE'), requirePermission('parcelgroup.manage'), ParcelGroupController.sendInvoice);

export default router;
