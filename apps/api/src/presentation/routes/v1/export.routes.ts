import { Router } from 'express';
import { ExportController } from '../../controllers/ExportController';
import { ImportController, xlsxImportMiddleware } from '../../controllers/ImportController';
import { authenticate, authorize } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

// Exports XLSX (avec images embarquees pour les colonnes contenant des URL d'image)
router.get('/parcels', ExportController.parcels);
router.get('/employees', ExportController.employees);
router.get('/clients', ExportController.clients);
router.get('/agencies', ExportController.agencies);

// Imports XLSX (avec images embarquees -> upload + URL stockee sur l'entite)
router.post(
  '/employees',
  authorize('SUPER_ADMIN', 'ADMIN'),
  xlsxImportMiddleware,
  ImportController.employees,
);
// Variante scopee a une agence (UI: depuis la page agence)
router.post(
  '/agencies/:agencyId/employees',
  authorize('SUPER_ADMIN', 'ADMIN'),
  xlsxImportMiddleware,
  ImportController.employees,
);

export default router;
