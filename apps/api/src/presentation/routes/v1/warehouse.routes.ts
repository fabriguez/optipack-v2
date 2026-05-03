import { Router } from 'express';
import { WarehouseController } from '../../controllers/WarehouseController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), WarehouseController.listAll);
router.get('/agency/:agencyId', validate(paginationSchema, 'query'), WarehouseController.list);
router.get('/:id', WarehouseController.getById);
router.get('/:id/summary', WarehouseController.getSummary);
router.get('/:id/inventories', WarehouseController.listInventories);
router.post('/', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), WarehouseController.create);
router.patch('/:id', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), WarehouseController.update);
router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), WarehouseController.delete);

// Inventaire
router.post(
  '/:id/inventories',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  WarehouseController.startInventory,
);
router.get('/inventories/:inventoryId', WarehouseController.getInventory);
router.post(
  '/inventories/:inventoryId/scan',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  WarehouseController.scanInventory,
);
router.post(
  '/inventories/:inventoryId/close',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  WarehouseController.closeInventory,
);

export default router;
