import { Router } from 'express';
import { PermissionController } from '../../controllers/PermissionController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { tenantGuard } from '../../middleware/tenantGuard';

const router = Router();

router.use(authenticate, tenantGuard);

// Catalogue (necessaire a l'UI admin pour afficher les cases a cocher).
router.get('/', requirePermission('permission.manage', 'position.manage'), PermissionController.list);

// La gestion des permissions est reservee a l'administrateur du tenant.
// authorize() est un garde DUR (pas de mode shadow) : meme en
// PERMISSIONS_ENFORCE=log, ces routes restent verrouillees.
const adminOnly = authorize('ADMIN', 'SUPER_ADMIN');

// Inspecter les permissions effectives d'un user precis.
router.get('/users/:userId', adminOnly, requirePermission('permission.manage', 'user.manage'), PermissionController.listForUser);

// Overrides individuels.
router.post('/users/:userId/overrides', adminOnly, requirePermission('permission.manage'), PermissionController.setOverride);
router.delete('/users/:userId/overrides/:permissionKey', adminOnly, requirePermission('permission.manage'), PermissionController.removeOverride);

export default router;
