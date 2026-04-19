import { Router } from 'express';
import { ManifestController } from '../../controllers/ManifestController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), ManifestController.list);
router.get('/comparison/:containerId', ManifestController.getComparison);
router.get('/:id', ManifestController.getById);
router.post('/dispatch/:containerId', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), ManifestController.createDispatch);
router.post('/reception/:containerId', authorize('SUPER_ADMIN', 'ADMIN', 'AGENT'), ManifestController.createReception);

export default router;
