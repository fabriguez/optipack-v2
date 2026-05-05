import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';

interface BreakdownInput {
  agencyId: string;
  /** Bornes optionnelles (ISO). Defaut : 30 derniers jours. */
  from?: Date;
  to?: Date;
}

/**
 * Aggregations financieres pour la page detail d'une agence :
 *  - paymentsByRouteAndMethod : paiements recus, par route de transit ET par mode
 *  - disbursementsByCategory  : decaissements par raison/categorie
 *  - entriesByRoute           : entrees caisse (paiements) ventiles par route
 *
 * On reprend la logique de DailyReportService mais sur une plage personnalisee.
 */
@injectable()
export class AgencyBreakdownUseCase {
  async execute({ agencyId, from, to }: BreakdownInput) {
    const dateFrom = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = to ?? new Date();

    const payments = await prisma.payment.findMany({
      where: {
        agencyId,
        isVoided: false,
        createdAt: { gte: dateFrom, lte: dateTo },
      },
      include: {
        invoice: {
          include: {
            parcels: { select: { transitRoute: { select: { id: true, name: true, type: true } } } },
          },
        },
      },
    });

    const paymentsByRouteAndMethod: Record<
      string,
      { routeId: string | null; routeName: string; type: string | null; methods: Record<string, number>; total: number; count: number }
    > = {};
    let paymentsTotal = 0;
    const entriesByRoute: Record<string, { routeId: string | null; routeName: string; type: string | null; total: number; count: number }> = {};

    for (const pay of payments) {
      const parcelsOfInvoice = pay.invoice?.parcels ?? [];
      const routes = new Set(parcelsOfInvoice.map((pp) => pp.transitRoute?.id ?? null));
      let routeId: string | null = null;
      let routeName = 'Sans route';
      let type: string | null = null;
      if (routes.size === 1) {
        const id = [...routes][0];
        const route = parcelsOfInvoice.find((pp) => (pp.transitRoute?.id ?? null) === id)?.transitRoute;
        routeId = route?.id ?? null;
        routeName = route?.name ?? 'Sans route';
        type = route?.type ?? null;
      } else if (routes.size > 1) {
        routeName = 'Mixte';
      }

      const key = routeId ?? routeName;
      paymentsByRouteAndMethod[key] ??= { routeId, routeName, type, methods: {}, total: 0, count: 0 };
      paymentsByRouteAndMethod[key].methods[pay.paymentMethod] =
        (paymentsByRouteAndMethod[key].methods[pay.paymentMethod] ?? 0) + Number(pay.amount);
      paymentsByRouteAndMethod[key].total += Number(pay.amount);
      paymentsByRouteAndMethod[key].count += 1;
      paymentsTotal += Number(pay.amount);

      entriesByRoute[key] ??= { routeId, routeName, type, total: 0, count: 0 };
      entriesByRoute[key].total += Number(pay.amount);
      entriesByRoute[key].count += 1;
    }

    const disbursements = await prisma.disbursementVoucher.findMany({
      where: {
        agencyId,
        isVoided: false,
        createdAt: { gte: dateFrom, lte: dateTo },
      },
    });

    const disbursementsByCategory: Record<string, { count: number; total: number }> = {};
    let disbursementsTotal = 0;
    for (const d of disbursements) {
      const cat = d.reason || 'OTHER';
      disbursementsByCategory[cat] ??= { count: 0, total: 0 };
      disbursementsByCategory[cat].count += 1;
      disbursementsByCategory[cat].total += Number(d.amount);
      disbursementsTotal += Number(d.amount);
    }

    return {
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
      paymentsTotal,
      paymentsByRouteAndMethod: Object.values(paymentsByRouteAndMethod),
      entriesByRoute: Object.values(entriesByRoute),
      disbursementsTotal,
      disbursementsByCategory: Object.entries(disbursementsByCategory).map(([category, v]) => ({
        category,
        count: v.count,
        total: v.total,
      })),
    };
  }
}
