/**
 * COMPATIBILITE : la table `recipients` a fusionne avec `clients`.
 * Cette route delegue desormais vers les controllers Client.
 * A terme, le frontend doit appeler /clients directement.
 */
import { Router } from 'express';
import { ClientController } from '../../controllers/ClientController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema, createClientSchema, updateClientSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('client.read'), validate(paginationSchema, 'query'), ClientController.list);
router.get('/agency/:agencyId', requirePermission('client.read'), validate(paginationSchema, 'query'), (req, res, next) => {
  // Compat : on injecte agencyId comme query param et on delegue a list
  req.query.agencyId = req.params.agencyId;
  return ClientController.list(req, res, next);
});
router.get('/:id', requirePermission('client.read'), ClientController.getById);
router.post('/', requirePermission('client.create'), validate(createClientSchema), ClientController.create);
router.patch('/:id', requirePermission('client.create'), validate(updateClientSchema), ClientController.update);
router.delete('/:id', requirePermission('client.create'), ClientController.delete);

export default router;
