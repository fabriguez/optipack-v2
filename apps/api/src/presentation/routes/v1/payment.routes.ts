import { Router } from 'express';
import { PaymentController } from '../../controllers/PaymentController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
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
// X1 : payment.void (accorde a Comptable + Chef) est le seul gardien ; le garde
// de role legacy est retire (il bloquait a tort les Comptables).
router.post('/:id/void', requirePermission('payment.void'), validate(voidPaymentSchema), PaymentController.void);

export default router;
