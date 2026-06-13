import { Router } from 'express';
import { PaymentController } from '../../controllers/PaymentController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { recordPaymentSchema, voidPaymentSchema, paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Lecture des paiements
router.get('/', validate(paginationSchema, 'query'), requirePermission('payment.read'), PaymentController.list);
router.get('/:id', requirePermission('payment.read'), PaymentController.getById);
router.get('/invoice/:invoiceId', requirePermission('payment.read'), PaymentController.getByInvoice);
// Enregistrement d'un paiement
router.post('/', validate(recordPaymentSchema), requirePermission('payment.record'), PaymentController.record);
// Seul ADMIN+ peut annuler un paiement
router.post('/:id/void', authorize('SUPER_ADMIN', 'ADMIN'), requirePermission('payment.void'), validate(voidPaymentSchema), PaymentController.void);

export default router;
