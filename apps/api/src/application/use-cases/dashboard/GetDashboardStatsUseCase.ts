import { injectable } from 'tsyringe';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import {
  andWhere,
  cashRegisterScope,
  clientScope,
  containerScope,
  debtScope,
  fundTransferScope,
  parcelScope,
  paymentScope,
  type ScopeCtx,
} from '../../services/scope/agencyScope';

@injectable()
export class GetDashboardStatsUseCase {
  async execute(ctx: ScopeCtx) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Scoping agence : undefined = pas de restriction (admin / mode shadow).
    const parcelW = parcelScope.where(ctx);
    const paymentW = paymentScope.where(ctx);
    const transferW = fundTransferScope.where(ctx);

    const [
      totalParcels,
      parcelsByStatus,
      confirmedTransfers,
      transfersByAgency,
      cashRegisters,
      totalDebts,
      topClients,
      parcelsPerDay,
      revenuePerDay,
      totalPayments,
      totalClients,
      totalContainers,
      recentParcels,
    ] = await Promise.all([
      prisma.parcel.count({ where: andWhere({ isDeleted: false }, parcelW) }),

      prisma.parcel.groupBy({
        by: ['status'],
        where: andWhere({ isDeleted: false }, parcelW),
        _count: true,
      }),

      prisma.fundTransfer.aggregate({
        where: andWhere({ status: 'CONFIRMED' as const, isVoided: false }, transferW),
        _sum: { amount: true },
      }),

      prisma.fundTransfer.groupBy({
        by: ['sourceAgencyId'],
        where: andWhere({ status: 'CONFIRMED' as const, isVoided: false }, transferW),
        _sum: { amount: true },
      }),

      prisma.agencyCashRegister.findMany({
        where: andWhere({ date: today }, cashRegisterScope.where(ctx)),
        include: { agency: { select: { id: true, name: true } } },
      }),

      prisma.debt.aggregate({
        where: andWhere({ isCleared: false }, debtScope.where(ctx)),
        _sum: { remainingAmount: true },
      }),

      prisma.client.findMany({
        where: andWhere({ isActive: true }, clientScope.where(ctx)),
        orderBy: { totalSpent: 'desc' },
        take: 10,
        select: { id: true, fullName: true, phone: true, totalSpent: true, loyaltyTier: true },
      }),

      // Colis par jour (7 derniers jours). SQL brut non scopable : bascule
      // sur Prisma + agregation en memoire quand le scope est actif.
      parcelW
        ? this.parcelsDaily(sevenDaysAgo, parcelW)
        : (prisma.$queryRaw`
            SELECT DATE(p."createdAt") as date, COUNT(*)::int as count
            FROM parcels p
            WHERE p."createdAt" >= ${sevenDaysAgo} AND p."isDeleted" = false
            GROUP BY DATE(p."createdAt")
            ORDER BY date ASC
          ` as Promise<{ date: Date; count: number }[]>),

      // Revenue par jour (7 derniers jours)
      paymentW
        ? this.paymentsDaily(sevenDaysAgo, paymentW)
        : (prisma.$queryRaw`
            SELECT DATE(p."createdAt") as date, SUM(p.amount)::float as total
            FROM payments p
            WHERE p."createdAt" >= ${sevenDaysAgo} AND p."isVoided" = false
            GROUP BY DATE(p."createdAt")
            ORDER BY date ASC
          ` as Promise<{ date: Date; total: number }[]>),

      prisma.payment.aggregate({
        where: andWhere({ isVoided: false }, paymentW),
        _sum: { amount: true },
        _count: true,
      }),

      prisma.client.count({ where: andWhere({ isActive: true }, clientScope.where(ctx)) }),

      prisma.container.count({
        where: andWhere({ isDeleted: false }, containerScope.where(ctx)),
      }),

      prisma.parcel.findMany({
        where: andWhere({ isDeleted: false }, parcelW),
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, trackingNumber: true, designation: true, status: true, price: true, createdAt: true,
          client: { select: { fullName: true } },
        },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const s of parcelsByStatus) statusMap[s.status] = s._count;

    // Build daily data for charts (fill missing days with 0)
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const parcelsChart = [];
    const revenueChart = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = days[d.getDay()];

      const parcelDay = (parcelsPerDay as any[]).find((p) => p.date?.toISOString?.()?.startsWith(dateStr) || String(p.date).startsWith(dateStr));
      const revenueDay = (revenuePerDay as any[]).find((r) => r.date?.toISOString?.()?.startsWith(dateStr) || String(r.date).startsWith(dateStr));

      parcelsChart.push({ day: dayName, date: dateStr, colis: parcelDay?.count || 0 });
      revenueChart.push({ day: dayName, date: dateStr, revenue: revenueDay?.total || 0 });
    }

    // Revenue by agency with names. `sourceAgencyId` est non-null en base mais
    // Prisma le type comme nullable dans groupBy : on filtre par securite.
    const transferAgencyIds = transfersByAgency
      .map((t) => t.sourceAgencyId)
      .filter((id): id is string => !!id);
    const agencyNames = await prisma.agency.findMany({
      where: { id: { in: transferAgencyIds } },
      select: { id: true, name: true },
    });
    const agencyNameMap: Record<string, string> = Object.fromEntries(
      agencyNames.map((a) => [a.id, a.name]),
    );

    return {
      totalParcels,
      totalClients,
      totalContainers,
      totalPaymentsCount: totalPayments._count,
      totalPaymentsAmount: Number(totalPayments._sum.amount || 0),
      parcelsByStatus: statusMap,
      totalRevenue: Number(confirmedTransfers._sum.amount || 0),
      revenueByAgency: transfersByAgency
        .filter((t): t is typeof t & { sourceAgencyId: string } => !!t.sourceAgencyId)
        .map((t) => ({
          agencyId: t.sourceAgencyId,
          agencyName: agencyNameMap[t.sourceAgencyId] || t.sourceAgencyId,
          total: Number(t._sum.amount || 0),
        })),
      cashInAgencies: cashRegisters.map((cr) => ({
        agencyId: cr.agency.id,
        agencyName: cr.agency.name,
        balance: Number(cr.currentBalance),
      })),
      cashAtHQ: Number(confirmedTransfers._sum.amount || 0),
      outstandingDebts: Number(totalDebts._sum.remainingAmount || 0),
      topClients: topClients.map((c) => ({
        clientId: c.id,
        clientName: c.fullName,
        phone: c.phone,
        totalSpent: Number(c.totalSpent),
        tier: c.loyaltyTier,
      })),
      parcelsChart,
      revenueChart,
      recentParcels,
    };
  }

  // Equivalent scope du $queryRaw colis/jour (agregation en memoire).
  private async parcelsDaily(since: Date, scope: Prisma.ParcelWhereInput) {
    const rows = await prisma.parcel.findMany({
      where: andWhere({ createdAt: { gte: since }, isDeleted: false }, scope),
      select: { createdAt: true },
    });
    const byDay = new Map<string, number>();
    for (const r of rows) {
      const key = r.createdAt.toISOString().split('T')[0];
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, count]) => ({ date: new Date(d), count }));
  }

  // Equivalent scope du $queryRaw revenue/jour.
  private async paymentsDaily(since: Date, scope: Prisma.PaymentWhereInput) {
    const rows = await prisma.payment.findMany({
      where: andWhere({ createdAt: { gte: since }, isVoided: false }, scope),
      select: { createdAt: true, amount: true },
    });
    const byDay = new Map<string, number>();
    for (const r of rows) {
      const key = r.createdAt.toISOString().split('T')[0];
      byDay.set(key, (byDay.get(key) ?? 0) + Number(r.amount));
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, total]) => ({ date: new Date(d), total }));
  }
}
