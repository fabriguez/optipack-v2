import { Router } from 'express';
import { AgencyController } from '../../controllers/AgencyController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { createAgencySchema, updateAgencySchema, paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), AgencyController.list);
router.get('/:id', AgencyController.getById);
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), validate(createAgencySchema), AgencyController.create);
router.patch('/:id', authorize('SUPER_ADMIN', 'ADMIN'), validate(updateAgencySchema), AgencyController.update);
router.delete('/:id', authorize('SUPER_ADMIN'), AgencyController.delete);

export default router;
