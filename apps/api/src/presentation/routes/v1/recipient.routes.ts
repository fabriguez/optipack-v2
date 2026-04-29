/**
 * COMPATIBILITE : la table `recipients` a fusionne avec `clients`.
 * Cette route delegue desormais vers les controllers Client.
 * A terme, le frontend doit appeler /clients directement.
 */
import { Router } from 'express';
import { ClientController } from '../../controllers/ClientController';
import { authenticate } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema, createClientSchema, updateClientSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), ClientController.list);
router.get('/agency/:agencyId', validate(paginationSchema, 'query'), (req, res, next) => {
  // Compat : on injecte agencyId comme query param et on delegue a list
  req.query.agencyId = req.params.agencyId;
  return ClientController.list(req, res, next);
});
router.get('/:id', ClientController.getById);
router.post('/', validate(createClientSchema), ClientController.create);
router.patch('/:id', validate(updateClientSchema), ClientController.update);
router.delete('/:id', ClientController.delete);

export default router;
