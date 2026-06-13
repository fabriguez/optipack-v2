import { Router } from 'express';
import { ContainerController } from '../../controllers/ContainerController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import {
  createContainerSchema,
  updateContainerSchema,
  loadParcelsSchema,
  loadByQrSchema,
  removeParcelFromContainerSchema,
  paginationSchema,
} from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Lecture des conteneurs
router.get('/', validate(paginationSchema, 'query'), requirePermission('container.read'), ContainerController.list);
router.get('/:id', requirePermission('container.read'), ContainerController.getById);
router.get('/:id/parcels', requirePermission('container.read'), ContainerController.getParcels);
router.get('/:id/arrival-snapshot', requirePermission('container.read'), ContainerController.getArrivalSnapshot);
router.get('/:id/loadable-parcels', requirePermission('container.read'), ContainerController.getLoadableParcels);
router.get('/:id/history', requirePermission('container.read'), ContainerController.getHistory);
// Mutations et actions du cycle de vie du conteneur
router.post('/', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), requirePermission('container.manage'), validate(createContainerSchema), ContainerController.create);
router.patch('/:id', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), requirePermission('container.manage'), validate(updateContainerSchema), ContainerController.update);
router.post('/:id/load', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'), requirePermission('container.manage'), validate(loadParcelsSchema), ContainerController.loadParcels);
router.post('/:id/load-by-qr', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'), requirePermission('container.manage'), validate(loadByQrSchema), ContainerController.loadByQr);
router.post('/:id/remove-parcel', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'), requirePermission('container.manage'), validate(removeParcelFromContainerSchema), ContainerController.removeParcel);
router.post('/:id/depart', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), requirePermission('container.manage'), ContainerController.depart);
router.post('/:id/arrive', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), requirePermission('container.manage'), ContainerController.arrive);
router.post('/:id/unload', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'), requirePermission('container.manage'), ContainerController.unloadParcel);

// Documents / images du conteneur (max 10)
router.get('/:id/documents', requirePermission('container.read'), ContainerController.listDocuments);
router.post('/:id/documents', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'COMPTABLE'), requirePermission('container.manage'), ContainerController.addDocument);
router.patch('/:id/documents/:documentId', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'COMPTABLE'), requirePermission('container.manage'), ContainerController.updateDocument);
router.delete('/:id/documents/:documentId', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'COMPTABLE'), requirePermission('container.manage'), ContainerController.deleteDocument);

export default router;
