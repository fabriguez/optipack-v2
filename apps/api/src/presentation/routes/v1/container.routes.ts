import { Router } from 'express';
import { ContainerController } from '../../controllers/ContainerController';
// X1 : gardes de role legacy retires — container.manage (accorde aux postes
// logistiques : Chef, Magasinier, Logisticien) est le seul gardien.
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
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
router.post('/', requirePermission('container.manage'), validate(createContainerSchema), ContainerController.create);
router.patch('/:id', requirePermission('container.manage'), validate(updateContainerSchema), ContainerController.update);
router.post('/:id/load', requirePermission('container.manage'), validate(loadParcelsSchema), ContainerController.loadParcels);
router.post('/:id/load-by-qr', requirePermission('container.manage'), validate(loadByQrSchema), ContainerController.loadByQr);
router.post('/:id/remove-parcel', requirePermission('container.manage'), validate(removeParcelFromContainerSchema), ContainerController.removeParcel);
router.post('/:id/depart', requirePermission('container.manage'), ContainerController.depart);
router.post('/:id/arrive', requirePermission('container.manage'), ContainerController.arrive);
router.post('/:id/unload', requirePermission('container.manage'), ContainerController.unloadParcel);

// Documents / images du conteneur (max 10)
router.get('/:id/documents', requirePermission('container.read'), ContainerController.listDocuments);
router.post('/:id/documents', requirePermission('container.manage'), ContainerController.addDocument);
router.patch('/:id/documents/:documentId', requirePermission('container.manage'), ContainerController.updateDocument);
router.delete('/:id/documents/:documentId', requirePermission('container.manage'), ContainerController.deleteDocument);

export default router;
