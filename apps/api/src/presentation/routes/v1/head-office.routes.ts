import { Router } from 'express';
import { HeadOfficeController } from '../../controllers/HeadOfficeController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import {
  createHeadOfficeDisbursementSchema,
  voidHeadOfficeDisbursementSchema,
  payEmployeeFromHeadOfficeSchema,
} from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Caisse siege (un seul registre par organisation, scope tenant).
router.get('/cash-register', requirePermission('headoffice.read'), HeadOfficeController.getCashRegister);
router.get('/:organizationId/cash-register', authorize('SUPER_ADMIN'), requirePermission('headoffice.read'), HeadOfficeController.getCashRegister);

// Decaissements siege
router.get('/disbursements', requirePermission('headoffice.read'), HeadOfficeController.listDisbursements);
router.get('/disbursements/:id', requirePermission('headoffice.read'), HeadOfficeController.getDisbursement);
router.post(
  '/disbursements',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('headoffice.manage'),
  validate(createHeadOfficeDisbursementSchema),
  HeadOfficeController.createDisbursement,
);
router.post(
  '/disbursements/:id/void',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('headoffice.manage'),
  validate(voidHeadOfficeDisbursementSchema),
  HeadOfficeController.voidDisbursement,
);

// Paiement employe depuis le siege
router.post(
  '/employees/:employeeId/pay',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('headoffice.manage'),
  validate(payEmployeeFromHeadOfficeSchema),
  HeadOfficeController.payEmployee,
);

export default router;
