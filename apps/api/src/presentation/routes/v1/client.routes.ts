import { Router } from 'express';
import { ClientController } from '../../controllers/ClientController';
import { authenticate } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { createClientSchema, updateClientSchema, paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), ClientController.list);
router.get('/:id', ClientController.getById);
router.post('/', validate(createClientSchema), ClientController.create);
router.patch('/:id', validate(updateClientSchema), ClientController.update);
router.delete('/:id', ClientController.delete);

export default router;
