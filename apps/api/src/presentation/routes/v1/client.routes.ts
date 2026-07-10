import { Router } from 'express';
import { ClientController } from '../../controllers/ClientController';
import { PartnerPricingController } from '../../controllers/PartnerPricingController';
import { ClientKycAdminController } from '../../controllers/ClientKycAdminController';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { uploadImageMiddleware, uploadDocumentMiddleware } from '../../middleware/upload';
import {
  createClientSchema,
  updateClientSchema,
  paginationSchema,
  partnerPricingSchema,
  updatePartnerPricingSchema,
} from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

// Permissions ABAC : lecture / ecriture client, validation KYC, fidelite.

// IMPORTANT : les routes "statiques" (export, import) doivent etre declarees
// AVANT `/:id` sinon Express interprete "export.xlsx" comme un id.
router.get('/export.xlsx', authorize('SUPER_ADMIN', 'ADMIN'), requirePermission('client.read'), ClientController.exportXlsx);
router.post(
  '/import',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('client.create'),
  uploadDocumentMiddleware,
  ClientController.importXlsx,
);

router.get('/', requirePermission('client.read'), validate(paginationSchema, 'query'), ClientController.list);
// KYC : file de validation + decision admin
router.get('/kyc/pending', authorize('SUPER_ADMIN', 'ADMIN'), requirePermission('kyc.read'), ClientKycAdminController.listPending);
router.post('/:id/verify', authorize('SUPER_ADMIN', 'ADMIN'), requirePermission('kyc.validate'), ClientKycAdminController.verify);
router.get('/:id', requirePermission('client.read'), ClientController.getById);
router.get('/:id/outstanding', requirePermission('client.read'), ClientController.getOutstanding);
router.get('/:id/score', requirePermission('client.read'), ClientController.getScore);
router.post('/', requirePermission('client.create'), validate(createClientSchema), ClientController.create);
router.patch('/:id', requirePermission('client.update'), validate(updateClientSchema), ClientController.update);
router.delete('/:id', requirePermission('client.delete'), ClientController.delete);

// Photos client : slot in {profile, idDocument, idDocumentBack}
router.get('/:id/image/:slot', requirePermission('client.read'), ClientController.getImage);
router.post('/:id/image/:slot', requirePermission('client.update'), uploadImageMiddleware, ClientController.uploadImage);
router.delete('/:id/image/:slot', requirePermission('client.update'), ClientController.deleteImage);

// Tarification partenaire. Mutations : cle dediee `client.partner.manage`
// (role specifique "gestion partenaires"), plus de verrou role admin — la
// cle est assignable a un poste via la matrice.
router.get('/:clientId/pricings', requirePermission('loyalty.read'), PartnerPricingController.list);
router.post(
  '/:clientId/pricings',
  requirePermission('client.partner.manage'),
  validate(partnerPricingSchema),
  PartnerPricingController.create,
);
router.patch(
  '/pricings/:id',
  requirePermission('client.partner.manage'),
  validate(updatePartnerPricingSchema),
  PartnerPricingController.update,
);
router.delete(
  '/pricings/:id',
  requirePermission('client.partner.manage'),
  PartnerPricingController.remove,
);

export default router;
