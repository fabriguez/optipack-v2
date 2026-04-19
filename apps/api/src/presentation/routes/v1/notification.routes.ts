import { Router } from 'express';
import { NotificationController } from '../../controllers/NotificationController';
import { authenticate } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), NotificationController.list);
router.get('/unread-count', NotificationController.countUnread);
router.get('/:id', NotificationController.getById);
router.post('/:id/read', NotificationController.markAsRead);
router.post('/read-all', NotificationController.markAllAsRead);

export default router;
