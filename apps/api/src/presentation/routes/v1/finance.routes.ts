import { Router, type Request, type Response, type NextFunction } from 'express';
import { FinanceController } from '../../controllers/FinanceController';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { prisma } from '../../../config/database';
import { andWhere, debtScope, paymentScope, scopeCtx } from '../../../application/services/scope/agencyScope';

const router = Router();

router.use(authenticate);

router.get('/timeline', requirePermission('finance.history.read'), FinanceController.timeline);

/**
 * Dashboard finance : agrege creances clients + dettes entreprise +
 * echus + recoltes du jour / mois. Scope agences accessibles a l'user
 * (SUPER_ADMIN voit tout).
 */
router.get('/debt-dashboard', requirePermission('finance.dashboard.read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.user!.organizationId;
    const isSuper = req.user!.role === 'SUPER_ADMIN';
    const agencyIds = isSuper ? null : (req.user!.agencyIds ?? []);
    // Scope agence (etape 2) : fragments merges en AND (undefined = admin/shadow).
    const ctx = scopeCtx(req);
    const paymentFrag = paymentScope.where(ctx);
    const debtWhere: any = andWhere({ organizationId }, debtScope.where(ctx));
    if (!isSuper) debtWhere.agencyId = { in: agencyIds && agencyIds.length > 0 ? agencyIds : ['__none__'] };
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [clientReceivable, companyDebt, overdueClient, overdueCompany, paidToday, paidMonth, dueTodayCount] = await Promise.all([
      // 1. Creances clients (montant restant a recuperer)
      prisma.debt.aggregate({
        where: { ...debtWhere, type: 'CLIENT', status: { notIn: ['CANCELLED' as never, 'CLEARED' as never] } },
        _sum: { remainingAmount: true },
      }),
      // 2. Dettes entreprise (employee + agency + carrier)
      prisma.debt.aggregate({
        where: { ...debtWhere, type: { in: ['EMPLOYEE', 'AGENCY', 'CARRIER'] as any }, status: { notIn: ['CANCELLED' as never, 'CLEARED' as never] } },
        _sum: { remainingAmount: true },
      }),
      // 3. Echus clients (OVERDUE)
      prisma.debt.aggregate({
        where: { ...debtWhere, type: 'CLIENT', status: 'OVERDUE' },
        _sum: { remainingAmount: true },
      }),
      // 4. Echus entreprise
      prisma.debt.aggregate({
        where: { ...debtWhere, type: { in: ['EMPLOYEE', 'AGENCY', 'CARRIER'] as any }, status: 'OVERDUE' },
        _sum: { remainingAmount: true },
      }),
      // 5. Encaissements aujourd'hui (paiements dette + paiements facture)
      Promise.all([
        prisma.debtPayment.aggregate({
          where: { isVoided: false, createdAt: { gte: startOfDay }, debt: debtWhere },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: andWhere({ isVoided: false, createdAt: { gte: startOfDay }, ...(isSuper ? {} : { agencyId: { in: agencyIds && agencyIds.length > 0 ? agencyIds : ['__none__'] } }) }, paymentFrag),
          _sum: { amount: true },
        }),
      ]),
      // 6. Encaissements mois
      Promise.all([
        prisma.debtPayment.aggregate({
          where: { isVoided: false, createdAt: { gte: startOfMonth }, debt: debtWhere },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: andWhere({ isVoided: false, createdAt: { gte: startOfMonth }, ...(isSuper ? {} : { agencyId: { in: agencyIds && agencyIds.length > 0 ? agencyIds : ['__none__'] } }) }, paymentFrag),
          _sum: { amount: true },
        }),
      ]),
      // 7. Dettes a echeance aujourd'hui (count)
      prisma.debt.count({
        where: {
          ...debtWhere,
          status: { notIn: ['CANCELLED' as never, 'CLEARED' as never] },
          nextDueDate: {
            gte: startOfDay,
            lt: new Date(startOfDay.getTime() + 24 * 3600 * 1000),
          },
        },
      }),
    ]);

    const paidTodayTotal = Number(paidToday[0]._sum.amount ?? 0) + Number(paidToday[1]._sum.amount ?? 0);
    const paidMonthTotal = Number(paidMonth[0]._sum.amount ?? 0) + Number(paidMonth[1]._sum.amount ?? 0);

    res.json({
      success: true,
      data: {
        clientReceivableTotal: Number(clientReceivable._sum.remainingAmount ?? 0),
        companyDebtTotal: Number(companyDebt._sum.remainingAmount ?? 0),
        overdueClientTotal: Number(overdueClient._sum.remainingAmount ?? 0),
        overdueCompanyTotal: Number(overdueCompany._sum.remainingAmount ?? 0),
        recoveredToday: paidTodayTotal,
        recoveredMonth: paidMonthTotal,
        dueTodayCount,
      },
    });
  } catch (err) { next(err); }
});

export default router;
