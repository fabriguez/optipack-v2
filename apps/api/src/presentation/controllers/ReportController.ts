import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import {
  andWhere,
  debtScope,
  disbursementScope,
  expenseScope,
  fundTransferScope,
  parcelScope,
  paymentScope,
  penaltyScope,
  scopeCtx,
} from '../../application/services/scope/agencyScope';

export class ReportController {
  /**
   * GET /reports/parcels?startDate&endDate&agencyId&status
   * Returns parcel stats and list for the given period.
   */
  static async parcels(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, agencyId, status } = req.query;
      const agencyIds = agencyId
        ? [agencyId as string]
        : req.user!.agencyIds;

      const dateFilter = ReportController.buildDateFilter(
        startDate as string,
        endDate as string,
        'createdAt',
      );

      // Scoping agence en AND par-dessus le filtre existant.
      const where: any = andWhere(
        {
          ...dateFilter,
          warehouse: { agencyId: { in: agencyIds } },
        },
        parcelScope.where(scopeCtx(req)),
      );
      if (status) where.status = status as string;

      const [totalCount, statusBreakdown, parcels] = await Promise.all([
        prisma.parcel.count({ where }),
        prisma.parcel.groupBy({
          by: ['status'],
          where,
          _count: { id: true },
          _sum: { weight: true, price: true },
        }),
        prisma.parcel.findMany({
          where,
          include: {
            client: { select: { id: true, fullName: true, phone: true } },
            recipient: { select: { id: true, fullName: true } },
            warehouse: { select: { id: true, name: true, agencyId: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      ]);

      const totalWeight = statusBreakdown.reduce(
        (sum, g) => sum + Number(g._sum.weight ?? 0),
        0,
      );
      const totalRevenue = statusBreakdown.reduce(
        (sum, g) => sum + Number(g._sum.price ?? 0),
        0,
      );

      res.json({
        success: true,
        data: {
          summary: {
            totalCount,
            totalWeight,
            totalRevenue,
            byStatus: statusBreakdown.map((g) => ({
              status: g.status,
              count: g._count.id,
              weight: Number(g._sum.weight ?? 0),
              revenue: Number(g._sum.price ?? 0),
            })),
          },
          details: parcels,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /reports/payments?startDate&endDate&agencyId
   * Returns payment summary with breakdown by method.
   */
  static async payments(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, agencyId } = req.query;
      const agencyIds = agencyId
        ? [agencyId as string]
        : req.user!.agencyIds;

      const dateFilter = ReportController.buildDateFilter(
        startDate as string,
        endDate as string,
        'createdAt',
      );

      // Scoping agence en AND par-dessus le filtre existant.
      const where: any = andWhere(
        { ...dateFilter, agencyId: { in: agencyIds }, isVoided: false },
        paymentScope.where(scopeCtx(req)),
      );

      const [totalAgg, byMethod, payments] = await Promise.all([
        prisma.payment.aggregate({
          where,
          _sum: { amount: true, discount: true, tva: true },
          _count: { id: true },
        }),
        prisma.payment.groupBy({
          by: ['paymentMethod'],
          where,
          _sum: { amount: true },
          _count: { id: true },
        }),
        prisma.payment.findMany({
          where,
          include: {
            invoice: {
              select: { reference: true, clientId: true, client: { select: { fullName: true } } },
            },
            agency: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      ]);

      res.json({
        success: true,
        data: {
          summary: {
            totalAmount: Number(totalAgg._sum.amount ?? 0),
            totalDiscount: Number(totalAgg._sum.discount ?? 0),
            totalTva: Number(totalAgg._sum.tva ?? 0),
            count: totalAgg._count.id,
            byMethod: byMethod.map((g) => ({
              method: g.paymentMethod,
              amount: Number(g._sum.amount ?? 0),
              count: g._count.id,
            })),
          },
          details: payments,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /reports/revenue?startDate&endDate
   * Returns revenue per agency.
   */
  static async revenue(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const agencyIds = req.user!.agencyIds;

      const dateFilter = ReportController.buildDateFilter(
        startDate as string,
        endDate as string,
        'createdAt',
      );

      // Scoping agence en AND par-dessus le filtre existant.
      const where: any = andWhere(
        { ...dateFilter, agencyId: { in: agencyIds }, isVoided: false },
        paymentScope.where(scopeCtx(req)),
      );

      const byAgency = await prisma.payment.groupBy({
        by: ['agencyId'],
        where,
        _sum: { amount: true, discount: true, tva: true },
        _count: { id: true },
      });

      // Fetch agency names
      const agencies = await prisma.agency.findMany({
        where: { id: { in: byAgency.map((g) => g.agencyId) } },
        select: { id: true, name: true, code: true },
      });
      const agencyMap = new Map(agencies.map((a) => [a.id, a]));

      const totalRevenue = byAgency.reduce(
        (sum, g) => sum + Number(g._sum.amount ?? 0),
        0,
      );

      res.json({
        success: true,
        data: {
          summary: {
            totalRevenue,
            agencyCount: byAgency.length,
          },
          details: byAgency.map((g) => ({
            agencyId: g.agencyId,
            agencyName: agencyMap.get(g.agencyId)?.name ?? 'Inconnu',
            agencyCode: agencyMap.get(g.agencyId)?.code ?? '',
            totalAmount: Number(g._sum.amount ?? 0),
            totalDiscount: Number(g._sum.discount ?? 0),
            totalTva: Number(g._sum.tva ?? 0),
            count: g._count.id,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /reports/debts?agencyId
   * Returns debt summary per client.
   */
  static async debts(req: Request, res: Response, next: NextFunction) {
    try {
      const { agencyId } = req.query;

      // Debts are linked to clients; filter through invoices for agency scope
      const invoiceWhere: any = {};
      if (agencyId) {
        invoiceWhere.agencyId = agencyId as string;
      } else {
        invoiceWhere.agencyId = { in: req.user!.agencyIds };
      }

      // Depuis la refonte dette (Phase 1), clientId est nullable (les dettes
      // typees EMPLOYEE/AGENCY/CARRIER n'ont pas de clientId). On filtre
      // explicitement aux dettes CLIENT pour ce rapport.
      const byClient = await prisma.debt.groupBy({
        by: ['clientId'],
        // Scoping agence en AND par-dessus le filtre facture existant.
        where: andWhere(
          {
            isCleared: false,
            type: 'CLIENT' as const,
            clientId: { not: null },
            invoice: invoiceWhere,
          },
          debtScope.where(scopeCtx(req)),
        ),
        _sum: { totalAmount: true, remainingAmount: true },
        _count: { id: true },
      });

      const clientIds = byClient
        .map((g) => g.clientId)
        .filter((id): id is string => id !== null);

      const clients = await prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, fullName: true, phone: true },
      });
      const clientMap = new Map(clients.map((c) => [c.id, c]));

      const totalDebt = byClient.reduce(
        (sum, g) => sum + Number(g._sum.remainingAmount ?? 0),
        0,
      );

      res.json({
        success: true,
        data: {
          summary: {
            totalDebt,
            clientCount: byClient.length,
            debtCount: byClient.reduce((sum, g) => sum + g._count.id, 0),
          },
          details: byClient
            .filter((g) => g.clientId !== null)
            .map((g) => ({
              clientId: g.clientId!,
              clientName: clientMap.get(g.clientId!)?.fullName ?? 'Inconnu',
              clientPhone: clientMap.get(g.clientId!)?.phone ?? '',
              totalAmount: Number(g._sum.totalAmount ?? 0),
              remainingAmount: Number(g._sum.remainingAmount ?? 0),
              debtCount: g._count.id,
            })),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /reports/cash-flow?startDate&endDate&agencyId
   * Returns entries, exits, disbursements, transfers per day.
   */
  static async cashFlow(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, agencyId } = req.query;
      const agencyIds = agencyId
        ? [agencyId as string]
        : req.user!.agencyIds;

      const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(new Date().getDate() - 30));
      const end = endDate ? new Date(endDate as string) : new Date();
      end.setHours(23, 59, 59, 999);

      const agencyFilter = { agencyId: { in: agencyIds } };
      const dateRange = { gte: start, lte: end };
      // Scoping agence par ressource, en AND des filtres existants.
      const ctx = scopeCtx(req);

      const [payments, disbursements, expenses, transfers] = await Promise.all([
        prisma.payment.aggregate({
          where: andWhere(
            { ...agencyFilter, isVoided: false, createdAt: dateRange },
            paymentScope.where(ctx),
          ),
          _sum: { amount: true },
          _count: { id: true },
        }),
        prisma.disbursementVoucher.aggregate({
          where: andWhere(
            { ...agencyFilter, isVoided: false, createdAt: dateRange },
            disbursementScope.where(ctx),
          ),
          _sum: { amount: true },
          _count: { id: true },
        }),
        prisma.expense.aggregate({
          where: andWhere(
            { ...agencyFilter, createdAt: dateRange },
            expenseScope.where(ctx),
          ),
          _sum: { amount: true },
          _count: { id: true },
        }),
        prisma.fundTransfer.aggregate({
          where: andWhere(
            {
              sourceAgencyId: { in: agencyIds },
              isVoided: false,
              createdAt: dateRange,
            },
            fundTransferScope.where(ctx),
          ),
          _sum: { amount: true },
          _count: { id: true },
        }),
      ]);

      const totalEntries = Number(payments._sum.amount ?? 0);
      const totalDisbursements = Number(disbursements._sum.amount ?? 0);
      const totalExpenses = Number(expenses._sum.amount ?? 0);
      const totalTransfers = Number(transfers._sum.amount ?? 0);
      const totalExits = totalDisbursements + totalExpenses + totalTransfers;

      res.json({
        success: true,
        data: {
          summary: {
            totalEntries,
            totalDisbursements,
            totalExpenses,
            totalTransfers,
            totalExits,
            netCashFlow: totalEntries - totalExits,
            period: { start, end },
          },
          details: {
            payments: { amount: totalEntries, count: payments._count.id },
            disbursements: { amount: totalDisbursements, count: disbursements._count.id },
            expenses: { amount: totalExpenses, count: expenses._count.id },
            transfers: { amount: totalTransfers, count: transfers._count.id },
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /reports/penalties?startDate&endDate&agencyId
   * Returns penalty stats.
   */
  static async penalties(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, agencyId } = req.query;
      const agencyIds = agencyId
        ? [agencyId as string]
        : req.user!.agencyIds;

      const dateFilter = ReportController.buildDateFilter(
        startDate as string,
        endDate as string,
        'createdAt',
      );

      // Scoping agence en AND par-dessus le filtre existant.
      const where: any = andWhere(
        { ...dateFilter, agencyId: { in: agencyIds } },
        penaltyScope.where(scopeCtx(req)),
      );

      const [totalAgg, paidAgg, unpaidAgg, penalties] = await Promise.all([
        prisma.penalty.aggregate({
          where,
          _sum: { totalAmount: true },
          _count: { id: true },
          _avg: { daysAccumulated: true },
        }),
        prisma.penalty.aggregate({
          where: { ...where, isPaid: true },
          _sum: { totalAmount: true },
          _count: { id: true },
        }),
        prisma.penalty.aggregate({
          where: { ...where, isPaid: false },
          _sum: { totalAmount: true },
          _count: { id: true },
        }),
        prisma.penalty.findMany({
          where,
          include: {
            client: { select: { id: true, fullName: true } },
            parcel: { select: { id: true, trackingNumber: true } },
            agency: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      ]);

      res.json({
        success: true,
        data: {
          summary: {
            totalAmount: Number(totalAgg._sum.totalAmount ?? 0),
            totalCount: totalAgg._count.id,
            avgDaysAccumulated: Math.round(Number(totalAgg._avg.daysAccumulated ?? 0)),
            paid: {
              amount: Number(paidAgg._sum.totalAmount ?? 0),
              count: paidAgg._count.id,
            },
            unpaid: {
              amount: Number(unpaidAgg._sum.totalAmount ?? 0),
              count: unpaidAgg._count.id,
            },
          },
          details: penalties,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ── Helpers ──────────────────────────────────────────────

  private static buildDateFilter(
    startDate: string | undefined,
    endDate: string | undefined,
    field: string,
  ): Record<string, any> {
    if (!startDate && !endDate) return {};

    const filter: any = {};
    if (startDate) {
      filter.gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.lte = end;
    }

    return { [field]: filter };
  }
}
