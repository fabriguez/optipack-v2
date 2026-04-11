import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';

@injectable()
export class GetDashboardStatsUseCase {
  async execute(agencyIds: string[]) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

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
      prisma.parcel.count({ where: { isDeleted: false } }),

      prisma.parcel.groupBy({ by: ['status'], where: { isDeleted: false }, _count: true }),

      prisma.fundTransfer.aggregate({
        where: { status: 'CONFIRMED', isVoided: false },
        _sum: { amount: true },
      }),

      prisma.fundTransfer.groupBy({
        by: ['sourceAgencyId'],
        where: { status: 'CONFIRMED', isVoided: false },
        _sum: { amount: true },
      }),

      prisma.agencyCashRegister.findMany({
        where: { date: today },
        include: { agency: { select: { id: true, name: true } } },
      }),

      prisma.debt.aggregate({ where: { isCleared: false }, _sum: { remainingAmount: true } }),

      prisma.client.findMany({
        where: { isActive: true },
        orderBy: { totalSpent: 'desc' },
        take: 10,
        select: { id: true, fullName: true, phone: true, totalSpent: true, loyaltyTier: true },
      }),

      // Colis par jour (7 derniers jours)
      prisma.$queryRaw`
        SELECT DATE(p."createdAt") as date, COUNT(*)::int as count
        FROM parcels p
        WHERE p."createdAt" >= ${sevenDaysAgo} AND p."isDeleted" = false
        GROUP BY DATE(p."createdAt")
        ORDER BY date ASC
      ` as Promise<{ date: Date; count: number }[]>,

      // Revenue par jour (7 derniers jours)
      prisma.$queryRaw`
        SELECT DATE(p."createdAt") as date, SUM(p.amount)::float as total
        FROM payments p
        WHERE p."createdAt" >= ${sevenDaysAgo} AND p."isVoided" = false
        GROUP BY DATE(p."createdAt")
        ORDER BY date ASC
      ` as Promise<{ date: Date; total: number }[]>,

      prisma.payment.aggregate({
        where: { isVoided: false },
        _sum: { amount: true },
        _count: true,
      }),

      prisma.client.count({ where: { isActive: true } }),

      prisma.container.count({ where: { isDeleted: false } }),

      prisma.parcel.findMany({
        where: { isDeleted: false },
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

    // Revenue by agency with names
    const agencyNames = await prisma.agency.findMany({
      where: { id: { in: transfersByAgency.map((t) => t.sourceAgencyId) } },
      select: { id: true, name: true },
    });
    const agencyNameMap = Object.fromEntries(agencyNames.map((a) => [a.id, a.name]));

    return {
      totalParcels,
      totalClients,
      totalContainers,
      totalPaymentsCount: totalPayments._count,
      totalPaymentsAmount: Number(totalPayments._sum.amount || 0),
      parcelsByStatus: statusMap,
      totalRevenue: Number(confirmedTransfers._sum.amount || 0),
      revenueByAgency: transfersByAgency.map((t) => ({
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
}
