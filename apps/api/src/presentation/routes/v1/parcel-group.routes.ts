import { Router } from 'express';
import { ParcelGroupController } from '../../controllers/ParcelGroupController';
// X1 : gardes de role legacy retires — parcelgroup.manage est le seul gardien.
import { authenticate, requirePermission } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('parcel.read'), ParcelGroupController.list);
router.get('/:id', requirePermission('parcel.read'), ParcelGroupController.get);
router.post('/', requirePermission('parcelgroup.manage'), ParcelGroupController.create);
router.post('/:id/parcels', requirePermission('parcelgroup.manage'), ParcelGroupController.addParcel);
router.post('/:id/invoice', requirePermission('parcelgroup.manage'), ParcelGroupController.generateInvoice);
router.post('/:id/send-invoice', requirePermission('parcelgroup.manage'), ParcelGroupController.sendInvoice);

export default router;
