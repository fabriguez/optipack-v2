import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';

/**
 * Service de generation du rapport journalier d'une agence.
 *
 * Aggrege pour la journee :
 *  - colis recus (status RECEIVED, arrivalDate du jour) par categorie et par route
 *  - reste a payer total (somme des restant des factures ouvertes des colis recus)
 *  - paiements recus, ventiles par route de transit ET par mode de paiement
 *  - decaissements ventiles par categorie/raison
 */
@injectable()
export class DailyReportService {
  async generate(agencyId: string, date: Date): Promise<{ id: string; payload: any }> {
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    // 1) Colis recus dans la journee (arrivalDate)
    const parcels = await prisma.parcel.findMany({
      where: {
        isDeleted: false,
        OR: [
          { destinationAgencyId: agencyId },
          { warehouse: { agencyId } },
        ],
        arrivalDate: { gte: dayStart, lt: dayEnd },
      },
      include: {
        transitRoute: { select: { id: true, name: true, type: true } },
        invoice: { select: { id: true, totalAmount: true, paidAmount: true, status: true } },
      },
    });

    const byCategory: Record<string, { count: number; totalRemaining: number }> = {};
    const byTransitRoute: Record<string, { routeId: string | null; routeName: string; type: string | null; count: number; totalRemaining: number }> = {};
    let totalRemaining = 0;

    for (const p of parcels) {
      const category = p.category || 'STANDARD';
      const remaining = p.invoice
        ? Math.max(0, Number(p.invoice.totalAmount) - Number(p.invoice.paidAmount ?? 0))
        : Number(p.price);

      totalRemaining += remaining;

      byCategory[category] ??= { count: 0, totalRemaining: 0 };
      byCategory[category].count += 1;
      byCategory[category].totalRemaining += remaining;

      const routeKey = p.transitRoute?.id ?? '__none__';
      byTransitRoute[routeKey] ??= {
        routeId: p.transitRoute?.id ?? null,
        routeName: p.transitRoute?.name ?? 'Sans route',
        type: p.transitRoute?.type ?? null,
        count: 0,
        totalRemaining: 0,
      };
      byTransitRoute[routeKey].count += 1;
      byTransitRoute[routeKey].totalRemaining += remaining;
    }

    // 2) Paiements recus, par route + methode
    const payments = await prisma.payment.findMany({
      where: {
        agencyId,
        isVoided: false,
        createdAt: { gte: dayStart, lt: dayEnd },
      },
      include: {
        invoice: {
          include: {
            parcels: {
              select: { transitRoute: { select: { id: true, name: true, type: true } } },
            },
          },
        },
      },
    });

    const paymentsByRouteAndMethod: Record<
      string,
      { routeId: string | null; routeName: string; methods: Record<string, number>; total: number }
    > = {};
    let paymentsTotal = 0;

    for (const pay of payments) {
      // Une facture peut couvrir plusieurs colis -> on attribue le paiement a
      // la premiere route trouvee ; si plusieurs, on note "Mixte".
      const parcelsOfInvoice = pay.invoice?.parcels ?? [];
      const routes = new Set(parcelsOfInvoice.map((pp) => pp.transitRoute?.id ?? null));
      let routeId: string | null = null;
      let routeName = 'Sans route';
      if (routes.size === 1) {
        const id = [...routes][0];
        const route = parcelsOfInvoice.find((pp) => (pp.transitRoute?.id ?? null) === id)?.transitRoute;
        routeId = route?.id ?? null;
        routeName = route?.name ?? 'Sans route';
      } else if (routes.size > 1) {
        routeName = 'Mixte';
      }

      const key = routeId ?? routeName;
      paymentsByRouteAndMethod[key] ??= {
        routeId,
        routeName,
        methods: {},
        total: 0,
      };
      const amount = Number(pay.amount);
      paymentsByRouteAndMethod[key].methods[pay.paymentMethod] =
        (paymentsByRouteAndMethod[key].methods[pay.paymentMethod] ?? 0) + amount;
      paymentsByRouteAndMethod[key].total += amount;
      paymentsTotal += amount;
    }

    // 3) Decaissements, par categorie / raison
    const disbursements = await prisma.disbursementVoucher.findMany({
      where: {
        agencyId,
        createdAt: { gte: dayStart, lt: dayEnd },
      },
    });

    const disbursementsByCategory: Record<string, { count: number; total: number; voided: number }> = {};
    let disbursementsTotal = 0;
    let disbursementsVoided = 0;
    for (const d of disbursements) {
      const cat = d.reason || 'OTHER';
      disbursementsByCategory[cat] ??= { count: 0, total: 0, voided: 0 };
      disbursementsByCategory[cat].count += 1;
      const amount = Number(d.amount);
      if (d.isVoided) {
        disbursementsVoided += amount;
        disbursementsByCategory[cat].voided += amount;
      } else {
        disbursementsTotal += amount;
        disbursementsByCategory[cat].total += amount;
      }
    }

    // 4) Solde caisse du jour (snapshot)
    const cashRegister = await prisma.agencyCashRegister.findFirst({
      where: { agencyId, date: { gte: dayStart, lt: dayEnd } },
    });

    const payload = {
      generatedAt: new Date().toISOString(),
      totalParcels: parcels.length,
      totalRemainingAmount: totalRemaining,
      byCategory,
      byTransitRoute,
      paymentsByRouteAndMethod,
      paymentsTotal,
      disbursementsByCategory,
      disbursementsTotal,
      disbursementsVoided,
      cashRegister: cashRegister
        ? {
            id: cashRegister.id,
            isClosed: cashRegister.isClosed,
            openingBalance: Number(cashRegister.openingBalance),
            totalEntries: Number(cashRegister.totalEntries),
            totalExits: Number(cashRegister.totalExits),
            currentBalance: Number(cashRegister.currentBalance),
            closingBalance: cashRegister.closingBalance ? Number(cashRegister.closingBalance) : null,
          }
        : null,
    };

    // Upsert : un rapport unique par agence/jour. On peut le regenerer.
    const existing = await prisma.agencyDailyReport.findUnique({
      where: { agencyId_date: { agencyId, date: dayStart } },
    });

    const saved = existing
      ? await prisma.agencyDailyReport.update({
          where: { id: existing.id },
          data: { payload, generatedAt: new Date() },
        })
      : await prisma.agencyDailyReport.create({
          data: { agencyId, date: dayStart, payload },
        });

    return { id: saved.id, payload };
  }
}

export const DAILY_REPORT_SERVICE = Symbol.for('DailyReportService');
