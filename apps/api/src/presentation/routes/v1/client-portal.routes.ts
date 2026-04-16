import { Router } from 'express';
import {
  ClientPortalController,
  authenticateClient,
} from '../../controllers/ClientPortalController';

const router = Router();

// Public routes
router.post('/login', ClientPortalController.login);
router.post('/register', ClientPortalController.register);

// Authenticated routes
router.get('/me', authenticateClient, ClientPortalController.me);
router.get('/parcels', authenticateClient, ClientPortalController.parcels);
router.get(
  '/parcels/:trackingNumber',
  authenticateClient,
  ClientPortalController.parcelByTracking,
);
router.get('/invoices', authenticateClient, ClientPortalController.invoices);
router.get('/payments', authenticateClient, ClientPortalController.payments);
router.get('/debts', authenticateClient, ClientPortalController.debts);
router.get(
  '/notifications',
  authenticateClient,
  ClientPortalController.notifications,
);
router.get('/agencies', authenticateClient, ClientPortalController.agencies);

export default router;
