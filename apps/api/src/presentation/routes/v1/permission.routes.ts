import { Router } from 'express';
import { PermissionController } from '../../controllers/PermissionController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { tenantGuard } from '../../middleware/tenantGuard';

const router = Router();

router.use(authenticate, tenantGuard);

// Catalogue (necessaire a l'UI admin pour afficher les cases a cocher).
router.get('/', requirePermission('permission.manage', 'position.manage'), PermissionController.list);

// Inspecter les permissions effectives d'un user precis.
router.get('/users/:userId', requirePermission('permission.manage', 'user.manage'), PermissionController.listForUser);

// Overrides individuels.
router.post('/users/:userId/overrides', requirePermission('permission.manage'), PermissionController.setOverride);
router.delete('/users/:userId/overrides/:permissionKey', requirePermission('permission.manage'), PermissionController.removeOverride);

export default router;
