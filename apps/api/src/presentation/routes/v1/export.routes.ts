import { Router } from 'express';
import { ExportController } from '../../controllers/ExportController';
import { ImportController, xlsxImportMiddleware } from '../../controllers/ImportController';
import { ImportClientsXlsxUseCase } from '../../../application/use-cases/client/ClientXlsxUseCases';
import { container } from '../../../container';
import { getOrgId } from '../../middleware/tenantGuard';
import { BusinessError } from '../../../domain/errors/BusinessError';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

// Exports XLSX (avec images embarquees pour les colonnes contenant des URL d'image)
router.get('/parcels', requirePermission('report.export'), ExportController.parcels);
router.get('/employees', requirePermission('report.export'), ExportController.employees);
router.get('/clients', requirePermission('report.export'), ExportController.clients);
router.get('/agencies', requirePermission('report.export'), ExportController.agencies);

// Imports XLSX (avec images embarquees -> upload + URL stockee sur l'entite)
// Import employes : pas de cle d'import dediee listee, on retombe sur report.export.
router.post(
  '/employees',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('report.export'),
  xlsxImportMiddleware,
  ImportController.employees,
);
// Variante scopee a une agence (UI: depuis la page agence)
// Import employes : pas de cle d'import dediee listee, on retombe sur report.export.
router.post(
  '/agencies/:agencyId/employees',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('report.export'),
  xlsxImportMiddleware,
  ImportController.employees,
);

// Import clients XLSX. Mappe en shape XlsxImportDialog : {imported, skipped, errors}.
router.post(
  '/clients',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('client.create'),
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
