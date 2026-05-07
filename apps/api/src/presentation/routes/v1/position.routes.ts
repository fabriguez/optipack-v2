import { Router } from 'express';
import { PositionController } from '../../controllers/PositionController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { tenantGuard } from '../../middleware/tenantGuard';

const router = Router();

router.use(authenticate, tenantGuard);

// Lecture : tout user qui a "personnel.read" peut consulter le catalogue.
router.get('/', requirePermission('personnel.read', 'position.manage'), PositionController.list);
router.get('/:id', requirePermission('personnel.read', 'position.manage'), PositionController.getById);

// Mutation : reservee aux gestionnaires de postes (admin).
router.post('/', requirePermission('position.manage'), PositionController.create);
router.patch('/:id', requirePermission('position.manage'), PositionController.update);
router.delete('/:id', requirePermission('position.manage'), PositionController.delete);

// Matrice de droits : gestion separee (peut etre confiee a un super-utilisateur).
router.put('/:id/permissions', requirePermission('permission.manage'), PositionController.setPermissions);

export default router;
