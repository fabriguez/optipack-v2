import { Router } from 'express';
import { HeadOfficeController } from '../../controllers/HeadOfficeController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import {
  createHeadOfficeDisbursementSchema,
  voidHeadOfficeDisbursementSchema,
  payEmployeeFromHeadOfficeSchema,
} from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Caisse siege (un seul registre par organisation, scope tenant).
router.get('/cash-register', HeadOfficeController.getCashRegister);
router.get('/:organizationId/cash-register', authorize('SUPER_ADMIN'), HeadOfficeController.getCashRegister);

// Decaissements siege
router.get('/disbursements', HeadOfficeController.listDisbursements);
router.get('/disbursements/:id', HeadOfficeController.getDisbursement);
router.post(
  '/disbursements',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(createHeadOfficeDisbursementSchema),
  HeadOfficeController.createDisbursement,
);
router.post(
  '/disbursements/:id/void',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(voidHeadOfficeDisbursementSchema),
  HeadOfficeController.voidDisbursement,
);

// Paiement employe depuis le siege
router.post(
  '/employees/:employeeId/pay',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(payEmployeeFromHeadOfficeSchema),
  HeadOfficeController.payEmployee,
);

export default router;
