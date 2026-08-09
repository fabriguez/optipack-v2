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
// Annulation d'un paiement : reservee aux administrateurs (demande metier).
// Double garde : role ADMIN/SUPER_ADMIN + permission payment.void. Le delai
// maximum de 2 jours apres creation est verifie dans VoidPaymentUseCase.
router.post(
  '/:id/void',
  authorize('ADMIN', 'SUPER_ADMIN'),
  requirePermission('payment.void'),
  validate(voidPaymentSchema),
  PaymentController.void,
);

export default router;
