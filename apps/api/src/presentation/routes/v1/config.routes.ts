import { Router, type Request, type Response, type NextFunction } from 'express';
import { ConfigController } from '../../controllers/ConfigController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { container } from '../../../container';
import { DebtBlockConfigService } from '../../../application/services/DebtBlockConfigService';

const router = Router();

// IMPORTANT : ce router est monte a la RACINE de l'API (`router.use(configRoutes)`),
// donc tout `router.use(mw)` global ici s'appliquerait AUSSI aux requetes des
// routers montes apres (uploads, exports, imports) qui le traversent — ce qui
// renvoyait un 403 admin-only sur GET /uploads/object/* pour les tokens client
// (portail web/mobile). On applique donc les gardes PAR ROUTE, jamais en global.
const adminOnly = [authenticate, authorize('SUPER_ADMIN', 'ADMIN')];

// System Config
router.get('/config', adminOnly, ConfigController.listConfigs);
router.put('/config/:key', adminOnly, ConfigController.updateConfig);

// Debt block config (handover + shipment) — auto-seed defaults au 1er read.
router.get('/config/debt-block', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const svc = container.resolve(DebtBlockConfigService);
    const cfg = await svc.get(req.user!.organizationId);
    res.json({ success: true, data: cfg });
  } catch (err) { next(err); }
});
router.patch('/config/debt-block', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const svc = container.resolve(DebtBlockConfigService);
    const patch = req.body as Record<string, unknown>;
    const cfg = await svc.update(req.user!.organizationId, {
      handoverEnabled: typeof patch.handoverEnabled === 'boolean' ? patch.handoverEnabled : undefined,
      handoverThreshold: patch.handoverThreshold !== undefined ? Number(patch.handoverThreshold) : undefined,
      shipmentEnabled: typeof patch.shipmentEnabled === 'boolean' ? patch.shipmentEnabled : undefined,
      shipmentThreshold: patch.shipmentThreshold !== undefined ? Number(patch.shipmentThreshold) : undefined,
    });
    res.json({ success: true, data: cfg });
  } catch (err) { next(err); }
});

// Currencies
router.get('/currencies', adminOnly, ConfigController.listCurrencies);
router.post('/currencies', adminOnly, ConfigController.createCurrency);
router.patch('/currencies/:id', adminOnly, ConfigController.updateCurrency);
router.delete('/currencies/:id', adminOnly, ConfigController.deleteCurrency);

export default router;
