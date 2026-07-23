import { Router } from 'express';
import { ExpenseController } from '../../controllers/ExpenseController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('expense.read'), validate(paginationSchema, 'query'), ExpenseController.list);
router.get('/container/:containerId', requirePermission('expense.read'), ExpenseController.listForContainer);
router.post('/container/:containerId', requirePermission('expense.create'), ExpenseController.createForContainer);
// Cloture des depenses du conteneur : acte de validation, assimile a l'approbation.
router.post('/container/:containerId/close', requirePermission('expense.approve'), ExpenseController.closeContainerExpenses);
// Propagation forwarding : cree des depenses enfants sur les conteneurs parents.
router.post('/container/:containerId/propagate-forwarding', requirePermission('expense.create'), ExpenseController.propagateForwardingExpenses);
router.post('/:id/pay', requirePermission('expense.pay'), ExpenseController.pay);
router.patch('/:id', requirePermission('expense.update'), ExpenseController.update);
router.delete('/:id', requirePermission('expense.delete'), ExpenseController.delete);
router.get('/:id', requirePermission('expense.read'), ExpenseController.getById);
router.post('/', requirePermission('expense.create'), ExpenseController.create);

export default router;
