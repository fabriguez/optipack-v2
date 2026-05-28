import { Router, type Request, type Response, type NextFunction } from 'express';
import { ConfigController } from '../../controllers/ConfigController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { container } from '../../../container';
import { DebtBlockConfigService } from '../../../application/services/DebtBlockConfigService';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN'));

// System Config
router.get('/config', ConfigController.listConfigs);
router.put('/config/:key', ConfigController.updateConfig);

// Debt block config (handover + shipment) — auto-seed defaults au 1er read.
router.get('/config/debt-block', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const svc = container.resolve(DebtBlockConfigService);
    const cfg = await svc.get(req.user!.organizationId);
    res.json({ success: true, data: cfg });
  } catch (err) { next(err); }
});
router.patch('/config/debt-block', async (req: Request, res: Response, next: NextFunction) => {
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
router.get('/currencies', ConfigController.listCurrencies);
router.post('/currencies', ConfigController.createCurrency);
router.patch('/currencies/:id', ConfigController.updateCurrency);
router.delete('/currencies/:id', ConfigController.deleteCurrency);

export default router;
