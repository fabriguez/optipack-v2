import { Router } from 'express';
import multer from 'multer';
import {
  ClientPortalController,
  authenticateClient,
} from '../../controllers/ClientPortalController';
import { ClientPortalExtraController } from '../../controllers/ClientPortalExtraController';
import { ClientPortalKycController } from '../../controllers/ClientPortalKycController';

const router = Router();

// Multer en memoire pour upload KYC (image jusqu'a 5 MB, champ `file`).
const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(new Error('Type non supporte. JPG, PNG ou WEBP requis.'));
      return;
    }
    cb(null, true);
  },
}).single('file');

// Public routes
router.post('/login', ClientPortalController.login);
router.post('/register', ClientPortalController.register);

// Authenticated routes
router.get('/me', authenticateClient, ClientPortalController.me);
router.patch('/me', authenticateClient, ClientPortalKycController.updateProfile);
router.post('/me/upload', authenticateClient, kycUpload, ClientPortalKycController.uploadDocument);

// Dashboard
router.get(
  '/dashboard',
  authenticateClient,
  ClientPortalExtraController.dashboard,
);

// Parcels
router.get('/parcels', authenticateClient, ClientPortalController.parcels);
router.get(
  '/parcels/:trackingNumber',
  authenticateClient,
  ClientPortalExtraController.parcelDetail,
);

// Finance
router.get('/invoices', authenticateClient, ClientPortalController.invoices);
router.get('/payments', authenticateClient, ClientPortalController.payments);
router.post(
  '/payments/declare',
  authenticateClient,
  ClientPortalExtraController.declarePayment,
);
router.get('/debts', authenticateClient, ClientPortalController.debts);

// Notifications
router.get(
  '/notifications',
  authenticateClient,
  ClientPortalController.notifications,
);
router.post(
  '/notifications/read-all',
  authenticateClient,
  ClientPortalExtraController.markAllNotificationsRead,
);
router.post(
  '/notifications/:id/read',
  authenticateClient,
  ClientPortalExtraController.markNotificationRead,
);

// Messagerie support
router.get(
  '/conversations',
  authenticateClient,
  ClientPortalExtraController.listConversations,
);
router.post(
  '/conversations',
  authenticateClient,
  ClientPortalExtraController.createConversation,
);
router.get(
  '/conversations/:id/messages',
  authenticateClient,
  ClientPortalExtraController.listMessages,
);
router.post(
  '/conversations/:id/messages',
  authenticateClient,
  ClientPortalExtraController.sendMessage,
);
router.post(
  '/conversations/:id/read',
  authenticateClient,
  ClientPortalExtraController.markConversationRead,
);

// Agences (lecture publique pour client connecte)
router.get('/agencies', authenticateClient, ClientPortalController.agencies);

export default router;
