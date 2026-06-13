import { Router } from 'express';
import { ChatController } from '../../controllers/ChatController';
import { StreamChatController } from '../../controllers/StreamChatController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Stream Chat : token agent (role admin) pour le support client temps reel.
// Token donne acces en lecture aux conversations support : cle support.read.
router.post('/stream/token', requirePermission('support.read'), StreamChatController.staffToken);

router.get('/', validate(paginationSchema, 'query'), requirePermission('support.read'), ChatController.listConversations);
// Creer une conversation = initier un echange, assimile a une reponse support.
router.post('/', requirePermission('support.reply'), ChatController.createConversation);
router.get('/:id', requirePermission('support.read'), ChatController.getConversation);
router.post('/:id/close', requirePermission('support.assign'), ChatController.closeConversation);
router.get('/:id/messages', validate(paginationSchema, 'query'), requirePermission('support.read'), ChatController.listMessages);
router.post('/:id/messages', requirePermission('support.reply'), ChatController.sendMessage);
// Marquer comme lu = action de consultation, cle support.read.
router.post('/:id/read', requirePermission('support.read'), ChatController.markRead);

export default router;
