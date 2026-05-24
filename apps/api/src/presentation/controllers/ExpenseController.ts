import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateExpenseUseCase } from '../../application/use-cases/expense/CreateExpenseUseCase';
import {
  CreateContainerExpenseUseCase,
  propagateForwardingExpense,
} from '../../application/use-cases/expense/CreateContainerExpenseUseCase';
import { PayExpenseFromCashRegisterUseCase } from '../../application/use-cases/expense/PayExpenseFromCashRegisterUseCase';
import { CloseContainerExpensesUseCase } from '../../application/use-cases/expense/CloseContainerExpensesUseCase';
import { BusinessError } from '../../domain/errors/BusinessError';
import { EXPENSE_REPOSITORY } from '../../application/interfaces/IExpenseRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';
import { prisma } from '../../config/database';

export class ExpenseController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateExpenseUseCase);
      const result = await useCase.execute(req.body, req.user!.userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(EXPENSE_REPOSITORY);
      const result = await repo.findAll(
        { agencyIds: req.user!.agencyIds },
        req.query,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(EXPENSE_REPOSITORY);
      const item = await repo.findById(req.params.id);
      if (!item) throw new NotFoundError('Depense', req.params.id);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  // ----- Container expenses -----

  static async listForContainer(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await prisma.expense.findMany({
        where: { containerId: req.params.containerId },
        orderBy: { createdAt: 'desc' },
        include: {
          cashRegister: { select: { id: true, date: true } },
          paidBy: { select: { id: true, firstName: true, lastName: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true } },
          // Tree forwarding : depenses auto enfants (sur les parents) avec
          // info container parent pour affichage breakdown + lien.
          childExpenses: {
            select: {
              id: true,
              amount: true,
              containerId: true,
              container: { select: { id: true, designation: true } },
            },
          },
          // Reverse : si cette depense est une auto, on remonte la depense
          // forwarding originale + son conteneur source (lien clickable).
          parentExpense: {
            select: {
              id: true,
              title: true,
              amount: true,
              containerId: true,
              container: { select: { id: true, designation: true, isForwarding: true } },
            },
          },
        },
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async createForContainer(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateContainerExpenseUseCase);
      const result = await useCase.execute(
        { ...req.body, containerId: req.params.containerId },
        req.user!.userId,
      );
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Edition d'une depense de conteneur. Si la depense a des enfants auto
   * (propagation forwarding), on supprime les anciens et on recree avec les
   * nouvelles proportions/montants. Cascade.
   * Refus si la depense est deja payee OU si elle est une auto (parentExpenseId).
   * Refus si le conteneur est cloture (sauf bypass auto-propagation).
   */
  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const expenseId = req.params.id;
      const expense = await prisma.expense.findUnique({
        where: { id: expenseId },
        include: {
          container: { select: { id: true, isForwarding: true, status: true, expensesClosedAt: true } },
          _count: { select: { childExpenses: true } },
        },
      });
      if (!expense) throw new NotFoundError('Depense', expenseId);
      if (expense.isPaid) throw new BusinessError('Depense deja payee, edition impossible.');
      if (expense.isAutoFromForwarding) {
        throw new BusinessError('Depense propagee automatiquement : non editable directement.');
      }
      if (expense.container?.expensesClosedAt) {
        throw new BusinessError('Conteneur cloture, edition impossible.');
      }

      const { title, reason, description, category, amount, receiptUrl, justificationUrl } = req.body;
      const newAmount = amount != null ? Number(amount) : Number(expense.amount);
      if (newAmount <= 0) throw new BusinessError('Montant invalide.');

      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.expense.update({
          where: { id: expenseId },
          data: {
            ...(title != null && { title: String(title).trim() }),
            ...(reason != null && { reason }),
            ...(description !== undefined && { description }),
            ...(category != null && { category }),
            ...(amount != null && { amount: newAmount }),
            ...(receiptUrl !== undefined && { receiptUrl }),
            ...(justificationUrl !== undefined && { justificationUrl }),
          },
        });

        // Cascade auto-expenses si forwarding ET deja propagee (childExpenses
        // existantes OU conteneur post-depart). Sinon on ne touche a rien :
        // la propagation se fera au moment du depart.
        const POST_DEPARTURE = new Set(['IN_TRANSIT', 'RECEIVED', 'UNLOADED']);
        const shouldCascade =
          expense.container?.isForwarding &&
          (expense._count.childExpenses > 0 || POST_DEPARTURE.has(expense.container.status));
        if (shouldCascade) {
          await tx.expense.deleteMany({
            where: { parentExpenseId: expenseId, isAutoFromForwarding: true, isPaid: false },
          });
          await propagateForwardingExpense(tx, expenseId, expense.container!.id, newAmount, req.user!.userId);
        }

        return updated;
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Suppression depense conteneur. Cascade : supprime aussi les auto-expenses
   * enfants. Refus si payee ou si auto.
   */
  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const expenseId = req.params.id;
      const expense = await prisma.expense.findUnique({
        where: { id: expenseId },
        include: {
          container: { select: { expensesClosedAt: true } },
        },
      });
      if (!expense) throw new NotFoundError('Depense', expenseId);
      if (expense.isPaid) throw new BusinessError('Depense deja payee, suppression impossible.');
      if (expense.isAutoFromForwarding) {
        throw new BusinessError('Depense propagee : suppression via la depense forwarding parente.');
      }
      if (expense.container?.expensesClosedAt) {
        throw new BusinessError('Conteneur cloture, suppression impossible.');
      }

      await prisma.$transaction(async (tx) => {
        // Cascade : supprime les auto-expenses non payees liees.
        await tx.expense.deleteMany({
          where: { parentExpenseId: expenseId, isAutoFromForwarding: true, isPaid: false },
        });
        await tx.expense.delete({ where: { id: expenseId } });
      });
      res.json({ success: true, message: 'Depense supprimee' });
    } catch (err) {
      next(err);
    }
  }

  static async closeContainerExpenses(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CloseContainerExpensesUseCase);
      const result = await useCase.execute(req.params.containerId, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async pay(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(PayExpenseFromCashRegisterUseCase);
      const result = await useCase.execute(
        {
          expenseId: req.params.id,
          cashRegisterId: req.body?.cashRegisterId,
          agencyId: req.body?.agencyId,
          note: req.body?.note,
        },
        req.user!.userId,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
