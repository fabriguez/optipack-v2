import { Router } from 'express';
import { LoyaltyController } from '../../controllers/LoyaltyController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Lecture fidelite (points et historique du client)
router.get('/client/:clientId', validate(paginationSchema, 'query'), requirePermission('loyalty.read'), LoyaltyController.getByClient);
router.get('/client/:clientId/points', requirePermission('loyalty.read'), LoyaltyController.getPoints);

// Configuration des tiers (admin) : seuils de points + reductions + avantages
router.get('/tiers', requirePermission('loyalty.read'), LoyaltyController.listTiers);
router.put('/tiers', authorize('SUPER_ADMIN', 'ADMIN'), requirePermission('loyalty.policy.manage'), LoyaltyController.upsertTiers);
router.delete('/tiers/:id', authorize('SUPER_ADMIN', 'ADMIN'), requirePermission('loyalty.policy.manage'), LoyaltyController.deleteTier);

export default router;
