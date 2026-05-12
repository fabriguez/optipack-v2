import { Router } from 'express';
import { ExportController } from '../../controllers/ExportController';
import { ImportController, xlsxImportMiddleware } from '../../controllers/ImportController';
import { ImportClientsXlsxUseCase } from '../../../application/use-cases/client/ClientXlsxUseCases';
import { container } from '../../../container';
import { getOrgId } from '../../middleware/tenantGuard';
import { BusinessError } from '../../../domain/errors/BusinessError';
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

// Import clients XLSX. Mappe en shape XlsxImportDialog : {imported, skipped, errors}.
router.post(
  '/clients',
  authorize('SUPER_ADMIN', 'ADMIN'),
  xlsxImportMiddleware,
  async (req, res, next) => {
    try {
      const file = (req as typeof req & { file?: { buffer: Buffer } }).file;
      if (!file?.buffer) throw new BusinessError('Fichier XLSX manquant (champ "file")');
      const useCase = container.resolve(ImportClientsXlsxUseCase);
      const r = await useCase.execute(getOrgId(req), file.buffer, {
        defaultAgencyId: (req.body?.defaultAgencyId as string | undefined) || undefined,
        dryRun: req.body?.dryRun === 'true' || req.body?.dryRun === true,
      });
      res.json({
        success: true,
        data: {
          imported: r.created,
          skipped: r.skipped,
          errors: r.errors.map((e) => ({ row: e.row, message: e.reason })),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
