/**
 * Administration des codes promo (backoffice tenant).
 *
 * Les codes sont scopes a l'organisation, pas a l'agence : une promo est une
 * decision commerciale du tenant. La lecture demande `promocode.read`, toute
 * ecriture `promocode.manage`.
 */
import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import {
  assignPromoCodeSchema,
  createPromoCodeSchema,
  updatePromoCodeSchema,
} from '@transitsoftservices/shared';
import { PromoCodeController } from '../../controllers/PromoCodeController';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('promocode.read'), PromoCodeController.list);
router.get('/:id', requirePermission('promocode.read'), PromoCodeController.getById);
router.get('/:id/redemptions', requirePermission('promocode.read'), PromoCodeController.listRedemptions);
router.get('/:id/assignments', requirePermission('promocode.read'), PromoCodeController.listAssignments);

router.post('/', validate(createPromoCodeSchema), requirePermission('promocode.manage'), PromoCodeController.create);
router.patch('/:id', validate(updatePromoCodeSchema), requirePermission('promocode.manage'), PromoCodeController.update);
router.delete('/:id', requirePermission('promocode.manage'), PromoCodeController.remove);

// Attribution nominative : un POST couvre l'attribution en masse (liste de
// clients) comme l'attribution unitaire.
router.post('/:id/assignments', validate(assignPromoCodeSchema), requirePermission('promocode.manage'), PromoCodeController.assign);
router.delete('/:id/assignments/:clientId', requirePermission('promocode.manage'), PromoCodeController.unassign);

export default router;
