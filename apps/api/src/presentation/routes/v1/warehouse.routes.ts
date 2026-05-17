import { Router } from 'express';
import { WarehouseController } from '../../controllers/WarehouseController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import {
  paginationSchema,
  createWarehouseStorageRuleSchema,
  updateWarehouseStorageRuleSchema,
} from '@transitsoftservices/shared';

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
// Marquage manuel sans scan (avec observation libre + flag markedManually=true)
router.post(
  '/inventories/:inventoryId/mark',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  WarehouseController.markInventoryItemManual,
);
// Liste des colis non encore inventories (pour saisie rapide / batch manuel)
router.get(
  '/inventories/:inventoryId/uninventoried',
  WarehouseController.listUninventoried,
);
router.post(
  '/inventories/:inventoryId/close',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  WarehouseController.closeInventory,
);

// Spaces de rangement
router.get('/:id/spaces', WarehouseController.listSpaces);
router.put(
  '/:id/spaces',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  WarehouseController.upsertSpaces,
);
// Deplacer un colis d'un space a un autre
router.post(
  '/parcels/:parcelId/space',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  WarehouseController.moveParcelToSpace,
);
// Enregistrer un colis trouve physiquement lors d'un inventaire en stock
router.post(
  '/inventories/:inventoryId/register-extra',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  WarehouseController.registerExtraInventoryParcel,
);
// Remettre en stock un colis precedemment marque absent / perdu
router.post(
  '/parcels/:parcelId/restock',
  authorize('SUPER_ADMIN', 'ADMIN', 'AGENT', 'MAGASINIER'),
  WarehouseController.restockParcel,
);

// Regles de frais de magasinage (CRUD)
router.get('/:id/storage-rules', WarehouseController.listStorageRules);
router.post(
  '/:id/storage-rules',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(createWarehouseStorageRuleSchema),
  WarehouseController.createStorageRule,
);
router.patch(
  '/storage-rules/:ruleId',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(updateWarehouseStorageRuleSchema),
  WarehouseController.updateStorageRule,
);
router.delete(
  '/storage-rules/:ruleId',
  authorize('SUPER_ADMIN', 'ADMIN'),
  WarehouseController.deleteStorageRule,
);

export default router;
