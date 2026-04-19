import { Router } from 'express';
import { PaymentController } from '../../controllers/PaymentController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { recordPaymentSchema, voidPaymentSchema, paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), PaymentController.list);
router.get('/:id', PaymentController.getById);
router.get('/invoice/:invoiceId', PaymentController.getByInvoice);
router.post('/', validate(recordPaymentSchema), PaymentController.record);
// Seul ADMIN+ peut annuler un paiement
router.post('/:id/void', authorize('SUPER_ADMIN', 'ADMIN'), validate(voidPaymentSchema), PaymentController.void);

export default router;
