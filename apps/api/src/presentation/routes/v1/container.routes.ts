import { Router } from 'express';
import { ContainerController } from '../../controllers/ContainerController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { createContainerSchema, loadParcelsSchema, paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), ContainerController.list);
router.get('/:id', ContainerController.getById);
router.get('/:id/parcels', ContainerController.getParcels);
router.get('/:id/history', ContainerController.getHistory);
router.post('/', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), validate(createContainerSchema), ContainerController.create);
router.post('/:id/load', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'), validate(loadParcelsSchema), ContainerController.loadParcels);
router.post('/:id/depart', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), ContainerController.depart);
router.post('/:id/arrive', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), ContainerController.arrive);
router.post('/:id/unload', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'), ContainerController.unloadParcel);

export default router;
