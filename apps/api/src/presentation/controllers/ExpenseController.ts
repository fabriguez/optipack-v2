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

/**
 * Reconstruit les liens ContainerForwardingParcelLink pour un forwarding
 * a partir de l'historique ParcelHistory. Utile pour les conteneurs charges
 * avant la mise en place du mapping per-parcel ou quand les colis arrivent
 * dans le forwarding sans containerId source (IN_STOCK pre-load).
 *
 * Algo :
 *  1. Trouve tous les LOADED_INTO_CONTAINER vers ce forwarding (parcelIds).
 *  2. Pour chaque colis, cherche le LOADED_INTO_CONTAINER PRECEDENT (vers
 *     un autre conteneur). Ce containerId precedent = parent source.
 *  3. Upsert le lien (forwarding, parcel) avec snapshot du prix courant.
 *
 * Retourne le nombre de liens crees/maj.
 */
async function reconstructForwardingLinksFromHistory(forwardingId: string): Promise<number> {
  const loadEvents = await prisma.parcelHistory.findMany({
    where: { action: 'LOADED_INTO_CONTAINER', containerId: forwardingId },
    select: { parcelId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (loadEvents.length === 0) return 0;

  let count = 0;
  for (const ev of loadEvents) {
    // Cherche le LOADED_INTO_CONTAINER precedent pour ce colis (vers un
    // autre conteneur). Si absent, le colis n'a pas de parent -> skip.
    const previous = await prisma.parcelHistory.findFirst({
      where: {
        parcelId: ev.parcelId,
        action: 'LOADED_INTO_CONTAINER',
        containerId: { not: forwardingId },
        createdAt: { lt: ev.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { containerId: true },
    });
    if (!previous?.containerId) continue;

    const parentId = previous.containerId;
    const parcel = await prisma.parcel.findUnique({
      where: { id: ev.parcelId },
      select: { price: true },
    });
    if (!parcel) continue;

    // Upsert ContainerForwardingParent (compteur).
    const parentLink = await prisma.containerForwardingParent.upsert({
      where: { forwardingId_parentId: { forwardingId, parentId } },
      create: { forwardingId, parentId, parcelCount: 0 },
      update: {},
    });

    // Upsert le lien per-parcel.
    await prisma.containerForwardingParcelLink.upsert({
      where: { forwardingId_parcelId: { forwardingId, parcelId: ev.parcelId } },
      create: {
        forwardingId,
        parentId,
        parcelId: ev.parcelId,
        containerForwardingParentId: parentLink.id,
        parcelPriceSnapshot: parcel.price,
      },
      update: {
        parentId,
        containerForwardingParentId: parentLink.id,
        parcelPriceSnapshot: parcel.price,
      },
    });
    count += 1;
  }

  // Recalcule parcelCount sur les ContainerForwardingParent depuis les liens.
  const groupedCounts = await prisma.containerForwardingParcelLink.groupBy({
    by: ['parentId'],
    where: { forwardingId },
    _count: { _all: true },
  });
  for (const g of groupedCounts) {
    await prisma.containerForwardingParent.update({
      where: { forwardingId_parentId: { forwardingId, parentId: g.parentId } },
      data: { parcelCount: g._count._all },
    });
  }

  return count;
}
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
      const containerId = req.params.containerId;
      const containerInfo = await prisma.container.findUnique({
        where: { id: containerId },
        select: { id: true, isForwarding: true },
      });

      const items = await prisma.expense.findMany({
        where: { containerId },
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

      // Forwarding container : enrichi chaque depense avec le breakdown
      // detaille (parcel-level + sum + proportion + calc) pour audit humain.
      let forwardingBreakdown: any[] | null = null;
      if (containerInfo?.isForwarding) {
        const links = await prisma.containerForwardingParcelLink.findMany({
          where: { forwardingId: containerId },
          include: {
            parent: { select: { id: true, designation: true } },
            parcel: { select: { id: true, trackingNumber: true, designation: true } },
          },
        });
        // Group by parentId.
        const byParent = new Map<string, {
          parentId: string;
          parentDesignation: string;
          parcels: Array<{ id: string; trackingNumber: string; designation: string; priceSnapshot: number }>;
          sum: number;
        }>();
        let totalSum = 0;
        for (const l of links) {
          const price = Number(l.parcelPriceSnapshot);
          totalSum += price;
          const cur = byParent.get(l.parentId);
          const parcelEntry = {
            id: l.parcel.id,
            trackingNumber: l.parcel.trackingNumber,
            designation: l.parcel.designation,
            priceSnapshot: price,
          };
          if (cur) {
            cur.parcels.push(parcelEntry);
            cur.sum += price;
          } else {
            byParent.set(l.parentId, {
              parentId: l.parentId,
              parentDesignation: l.parent.designation,
              parcels: [parcelEntry],
              sum: price,
            });
          }
        }
        forwardingBreakdown = Array.from(byParent.values()).map((g) => ({
          ...g,
          proportion: totalSum > 0 ? g.sum / totalSum : 0,
          totalSum,
        }));
      }

      // Attache le breakdown a chaque depense forwarding (meme data partagee).
      const enriched = items.map((e) => {
        const isForwardingExpense =
          containerInfo?.isForwarding && !e.isAutoFromForwarding && !e.parentExpenseId;
        return {
          ...e,
          forwardingBreakdown: isForwardingExpense ? forwardingBreakdown : null,
        };
      });

      res.json({ success: true, data: enriched });
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

  /**
   * Force la propagation des depenses d'un conteneur forwarding vers ses
   * parents. Utile quand le depart a deja eu lieu mais la propagation a
   * echoue (ex: schema migre apres le depart). Idempotent : ne re-propage
   * pas les depenses ayant deja des enfants.
   */
  static async propagateForwardingExpenses(req: Request, res: Response, next: NextFunction) {
    try {
      const containerId = req.params.containerId;
      const containerInfo = await prisma.container.findUnique({
        where: { id: containerId },
        select: { id: true, isForwarding: true, designation: true },
      });
      if (!containerInfo) throw new NotFoundError('Conteneur', containerId);
      if (!containerInfo.isForwarding) {
        throw new BusinessError('Ce conteneur n\'est pas un conteneur d\'acheminement.');
      }

      const pendingExpenses = await prisma.expense.findMany({
        where: {
          containerId,
          isAutoFromForwarding: false,
          parentExpenseId: null,
          childExpenses: { none: {} },
        },
        select: { id: true, amount: true },
      });

      let linkCount = await prisma.containerForwardingParcelLink.count({
        where: { forwardingId: containerId },
      });

      // Fallback : si liens absents (cas legacy : chargement fait avant le
      // patch ContainerForwardingParcelLink, ou colis IN_STOCK avec containerId
      // null au moment du load), on reconstruit depuis ParcelHistory.
      // On cherche les events LOADED_INTO_CONTAINER vers ce forwarding, puis
      // pour chaque colis on cherche le LOADED_INTO_CONTAINER precedent
      // (= conteneur parent source).
      if (linkCount === 0) {
        const reconstructed = await reconstructForwardingLinksFromHistory(containerId);
        linkCount = reconstructed;
        if (linkCount === 0) {
          return res.status(400).json({
            success: false,
            message:
              "Aucun colis lie a un conteneur parent dans ce forwarding (ni table de liens, ni historique exploitable).",
          });
        }
      }

      const errors: Array<{ expenseId: string; error: string }> = [];
      let propagated = 0;
      for (const exp of pendingExpenses) {
        try {
          await prisma.$transaction(async (tx) => {
            await propagateForwardingExpense(tx, exp.id, containerId, Number(exp.amount), req.user!.userId);
          });
          propagated += 1;
        } catch (err) {
          errors.push({ expenseId: exp.id, error: err instanceof Error ? err.message : String(err) });
        }
      }

      res.json({
        success: true,
        data: { pendingCount: pendingExpenses.length, propagatedCount: propagated, linkCount, errors },
      });
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
