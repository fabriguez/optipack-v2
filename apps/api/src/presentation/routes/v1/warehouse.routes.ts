import { Router } from 'express';
import { WarehouseController } from '../../controllers/WarehouseController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import {
  paginationSchema,
  createWarehouseStorageRuleSchema,
  updateWarehouseStorageRuleSchema,
} from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Permissions ABAC : lecture entrepot, gestion entrepot, gestion inventaire.

router.get('/', requirePermission('warehouse.read'), validate(paginationSchema, 'query'), WarehouseController.listAll);
router.get('/agency/:agencyId', requirePermission('warehouse.read'), validate(paginationSchema, 'query'), WarehouseController.list);
router.get('/:id', requirePermission('warehouse.read'), WarehouseController.getById);
router.get('/:id/summary', requirePermission('warehouse.read'), WarehouseController.getSummary);
router.get('/:id/inventories', requirePermission('warehouse.read'), WarehouseController.listInventories);
router.post('/', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), requirePermission('warehouse.manage'), WarehouseController.create);
router.patch('/:id', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), requirePermission('warehouse.manage'), WarehouseController.update);
router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), requirePermission('warehouse.manage'), WarehouseController.delete);

// Inventaire
router.post(
  '/:id/inventories',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  requirePermission('warehouse.inventory.manage'),
  WarehouseController.startInventory,
);
router.get('/inventories/:inventoryId', requirePermission('warehouse.read'), WarehouseController.getInventory);
router.post(
  '/inventories/:inventoryId/scan',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  requirePermission('warehouse.inventory.manage'),
  WarehouseController.scanInventory,
);
// Marquage manuel sans scan (avec observation libre + flag markedManually=true)
router.post(
  '/inventories/:inventoryId/mark',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  requirePermission('warehouse.inventory.manage'),
  WarehouseController.markInventoryItemManual,
);
// Liste des colis non encore inventories (pour saisie rapide / batch manuel)
router.get(
  '/inventories/:inventoryId/uninventoried',
  requirePermission('warehouse.read'),
  WarehouseController.listUninventoried,
);
router.post(
  '/inventories/:inventoryId/close',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  requirePermission('warehouse.inventory.manage'),
  WarehouseController.closeInventory,
);

// Spaces de rangement
router.get('/:id/spaces', requirePermission('warehouse.read'), WarehouseController.listSpaces);
router.put(
  '/:id/spaces',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  requirePermission('warehouse.manage'),
  WarehouseController.upsertSpaces,
);
// Deplacer un colis d'un space a un autre
router.post(
  '/parcels/:parcelId/space',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  requirePermission('warehouse.manage'),
  WarehouseController.moveParcelToSpace,
);
// Enregistrer un colis trouve physiquement lors d'un inventaire en stock
router.post(
  '/inventories/:inventoryId/register-extra',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  requirePermission('warehouse.inventory.manage'),
  WarehouseController.registerExtraInventoryParcel,
);
// Remettre en stock un colis precedemment marque absent / perdu
// (action liee a l'inventaire, donc cle inventaire)
router.post(
  '/parcels/:parcelId/restock',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  requirePermission('warehouse.inventory.manage'),
  WarehouseController.restockParcel,
);

// Regles de frais de magasinage (CRUD)
router.get('/:id/storage-rules', requirePermission('warehouse.read'), WarehouseController.listStorageRules);
router.post(
  '/:id/storage-rules',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('warehouse.manage'),
  validate(createWarehouseStorageRuleSchema),
  WarehouseController.createStorageRule,
);
router.patch(
  '/storage-rules/:ruleId',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('warehouse.manage'),
  validate(updateWarehouseStorageRuleSchema),
  WarehouseController.updateStorageRule,
);
router.delete(
  '/storage-rules/:ruleId',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('warehouse.manage'),
  WarehouseController.deleteStorageRule,
);

export default router;
