import { Router } from 'express';
import { PositionController } from '../../controllers/PositionController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { tenantGuard } from '../../middleware/tenantGuard';

const router = Router();

router.use(authenticate, tenantGuard);

// Lecture : tout user qui a "personnel.read" peut consulter le catalogue.
router.get('/', requirePermission('personnel.read', 'position.manage'), PositionController.list);
router.get('/:id', requirePermission('personnel.read', 'position.manage'), PositionController.getById);

// Mutations : reservees a l'administrateur du tenant. authorize() est un garde
// DUR (pas de mode shadow) : meme en PERMISSIONS_ENFORCE=log, ces routes
// restent verrouillees.
const adminOnly = authorize('ADMIN', 'SUPER_ADMIN');
router.post('/', adminOnly, requirePermission('position.manage'), PositionController.create);
router.patch('/:id', adminOnly, requirePermission('position.manage'), PositionController.update);
router.delete('/:id', adminOnly, requirePermission('position.manage'), PositionController.delete);

// Matrice de droits.
router.put('/:id/permissions', adminOnly, requirePermission('permission.manage'), PositionController.setPermissions);

export default router;
