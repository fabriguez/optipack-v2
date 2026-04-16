import { Router } from 'express';
import { ChatController } from '../../controllers/ChatController';
import { authenticate } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@optipack/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), ChatController.listConversations);
router.post('/', ChatController.createConversation);
router.get('/:id', ChatController.getConversation);
router.post('/:id/close', ChatController.closeConversation);
router.get('/:id/messages', validate(paginationSchema, 'query'), ChatController.listMessages);
router.post('/:id/messages', ChatController.sendMessage);
router.post('/:id/read', ChatController.markRead);

export default router;
