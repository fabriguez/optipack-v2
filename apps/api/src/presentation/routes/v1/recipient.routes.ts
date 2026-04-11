import { Router } from 'express';
import { RecipientController } from '../../controllers/RecipientController';
import { authenticate } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { createRecipientSchema, updateRecipientSchema, paginationSchema } from '@optipack/shared';

const router = Router();

router.use(authenticate);

router.get('/agency/:agencyId', validate(paginationSchema, 'query'), RecipientController.list);
router.get('/:id', RecipientController.getById);
router.post('/', validate(createRecipientSchema), RecipientController.create);
router.patch('/:id', validate(updateRecipientSchema), RecipientController.update);
router.delete('/:id', RecipientController.delete);

export default router;
