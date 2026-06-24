import { Router } from 'express';
import { NotificationController } from '../../controllers/NotificationController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Centre de notifications (admin tenant). Declare AVANT '/:id' pour eviter que
// '/admin' soit capture comme un id.
router.get('/admin', requirePermission('notification.read'), validate(paginationSchema, 'query'), NotificationController.adminList);
router.get('/admin/stats', requirePermission('notification.read'), NotificationController.adminStats);

router.get('/', validate(paginationSchema, 'query'), NotificationController.list);
router.get('/unread-count', NotificationController.countUnread);
router.get('/:id', NotificationController.getById);
router.post('/:id/read', NotificationController.markAsRead);
router.post('/:id/retry', requirePermission('notification.manage'), NotificationController.retry);
router.post('/read-all', NotificationController.markAllAsRead);

export default router;
