import { Router } from 'express';
import { ConfigController } from '../../controllers/ConfigController';
import { authenticate, authorize } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN'));

// System Config
router.get('/config', ConfigController.listConfigs);
router.put('/config/:key', ConfigController.updateConfig);

// Currencies
router.get('/currencies', ConfigController.listCurrencies);
router.post('/currencies', ConfigController.createCurrency);
router.patch('/currencies/:id', ConfigController.updateCurrency);
router.delete('/currencies/:id', ConfigController.deleteCurrency);

export default router;
