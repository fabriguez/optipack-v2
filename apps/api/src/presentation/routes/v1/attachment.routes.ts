import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { prisma } from '../../../config/database';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

const router = Router();
router.use(authenticate);

/**
 * Routes generiques pour 3 types d'attachements : Expense, Disbursement, Debt.
 * Format identique (url, key, kind, caption). Le type est determine par le
 * segment de path. Mutualise ici pour eviter la duplication.
 */

type AttachmentType = 'expense' | 'disbursement' | 'debt' | 'fund-transfer';

function resolveDelegate(type: AttachmentType) {
  switch (type) {
    case 'expense':
      return {
        delegate: prisma.expenseAttachment,
        parentDelegate: prisma.expense,
        parentField: 'expenseId' as const,
      };
    case 'disbursement':
      return {
        delegate: prisma.disbursementAttachment,
        parentDelegate: prisma.disbursementVoucher,
        parentField: 'disbursementId' as const,
      };
    case 'debt':
      return {
        delegate: prisma.debtAttachment,
        parentDelegate: prisma.debt,
        parentField: 'debtId' as const,
      };
    case 'fund-transfer':
      return {
        delegate: prisma.fundTransferAttachment,
        parentDelegate: prisma.fundTransfer,
        parentField: 'fundTransferId' as const,
      };
  }
}

function buildHandlers(type: AttachmentType) {
  const cfg = resolveDelegate(type);

  return {
    list: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parentId = req.params.id;
        const parent = await (cfg.parentDelegate as any).findUnique({ where: { id: parentId } });
        if (!parent) throw new NotFoundError(type, parentId);
        const items = await (cfg.delegate as any).findMany({
          where: { [cfg.parentField]: parentId },
          orderBy: { createdAt: 'desc' },
          include: { uploadedBy: { select: { firstName: true, lastName: true } } },
        });
        res.json({ success: true, data: items });
      } catch (err) { next(err); }
    },
    add: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parentId = req.params.id;
        const { url, key, kind, caption } = req.body as Record<string, string | null | undefined>;
        if (!url || !key || !kind) {
          throw new BusinessError('url, key, kind requis.');
        }
        const parent = await (cfg.parentDelegate as any).findUnique({ where: { id: parentId } });
        if (!parent) throw new NotFoundError(type, parentId);
        const created = await (cfg.delegate as any).create({
          data: {
            [cfg.parentField]: parentId,
            url,
            key,
            kind,
            caption: caption ?? null,
            uploadedByUserId: req.user?.userId ?? null,
          },
          include: { uploadedBy: { select: { firstName: true, lastName: true } } },
        });
        res.status(201).json({ success: true, data: created });
      } catch (err) { next(err); }
    },
    remove: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const found = await (cfg.delegate as any).findUnique({ where: { id: req.params.attId } });
        if (!found || found[cfg.parentField] !== req.params.id) {
          throw new NotFoundError('Piece jointe', req.params.attId);
        }
        await (cfg.delegate as any).delete({ where: { id: found.id } });
        res.json({ success: true });
      } catch (err) { next(err); }
    },
  };
}

// Lecture : authenticate seul pour l'instant (scoping objet a venir).
const expenseHandlers = buildHandlers('expense');
router.get('/expenses/:id/attachments', expenseHandlers.list);
router.post('/expenses/:id/attachments', requirePermission('expense.create'), expenseHandlers.add);
router.delete('/expenses/:id/attachments/:attId', requirePermission('expense.create'), expenseHandlers.remove);

const disbursementHandlers = buildHandlers('disbursement');
router.get('/disbursements/:id/attachments', disbursementHandlers.list);
router.post('/disbursements/:id/attachments', requirePermission('disbursement.create'), disbursementHandlers.add);
router.delete('/disbursements/:id/attachments/:attId', requirePermission('disbursement.create'), disbursementHandlers.remove);

const debtHandlers = buildHandlers('debt');
router.get('/debts/:id/attachments', debtHandlers.list);
router.post('/debts/:id/attachments', requirePermission('debt.update'), debtHandlers.add);
router.delete('/debts/:id/attachments/:attId', requirePermission('debt.update'), debtHandlers.remove);

// Transferts de fonds : justificatifs portes par la permission d'initiation.
const fundTransferHandlers = buildHandlers('fund-transfer');
router.get('/fund-transfers/:id/attachments', fundTransferHandlers.list);
router.post('/fund-transfers/:id/attachments', requirePermission('transfer.initiate'), fundTransferHandlers.add);
router.delete('/fund-transfers/:id/attachments/:attId', requirePermission('transfer.initiate'), fundTransferHandlers.remove);

export default router;
