import { injectable } from 'tsyringe';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';

type RouteKey = string;

interface RouteAgg {
  routeId: string | null;
  routeName: string;
  type: string | null;
}

interface ParcelMassVolAgg extends RouteAgg {
  count: number;
  totalWeight: number;
  totalVolume: number;
  totalPrice: number;
}

interface PaymentRouteMethodAgg extends RouteAgg {
  methods: Record<string, number>;
  total: number;
}

interface ContainerRouteAgg extends RouteAgg {
  count: number;
  totalWeight: number;
  totalVolume: number;
}

interface ContainerRow {
  id: string;
  designation: string;
  type: string;
  status: string;
  routeId: string | null;
  routeName: string;
  loadingDate: string | null;
  departureDate: string | null;
  arrivalDate: string | null;
  parcels: number;
  totalWeight: number;
  totalVolume: number;
  byRoute: Record<RouteKey, ContainerRouteAgg>;
}

function routeKeyOf(route: { id?: string | null } | null | undefined): string {
  return route?.id ?? '__none__';
}

function bumpRoute(
  bucket: Record<RouteKey, RouteAgg>,
  route: { id?: string | null; name?: string | null; type?: string | null } | null | undefined,
): RouteKey {
  const key = routeKeyOf(route);
  if (!bucket[key]) {
    bucket[key] = {
      routeId: route?.id ?? null,
      routeName: route?.name ?? 'Sans route',
      type: route?.type ?? null,
    };
  }
  return key;
}

/**
 * Service de generation du rapport journalier d'une agence.
 *
 * Fenetre temporelle : "session caisse" et non "jour calendaire". On lit la
 * caisse de la date demandee et on agrege tous les evenements compris entre
 * `cashRegister.createdAt` et `cashRegister.closedAt ?? now`. Une fois la
 * caisse cloturee, tout nouvel evenement bascule sur la caisse du jour
 * suivant (creee par `findOrCreateForToday`) et apparaitra donc dans le
 * rapport du jour suivant -- conformement a la regle metier "post-cloture =
 * jour suivant". Si aucune caisse n'existe pour la date, on retombe sur le
 * jour calendaire UTC.
 */
@injectable()
export class DailyReportService {
  async generate(agencyId: string, date: Date): Promise<{ id: string; payload: any }> {
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    // Fenetre = session caisse si existante, sinon jour calendaire
    const cashRegister = await prisma.agencyCashRegister.findFirst({
      where: { agencyId, date: { gte: dayStart, lt: dayEnd } },
      include: { closedBy: { select: { firstName: true, lastName: true } } },
    });

    const windowStart = cashRegister?.createdAt ?? dayStart;
    const windowEnd = cashRegister?.closedAt ?? new Date();
    const windowFilter = { gte: windowStart, lt: windowEnd };

    // Resolution agence + organisation (branding header/footer du PDF)
    const agency = await prisma.agency.findUnique({
      where: { id: agencyId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            primaryColor: true,
            secondaryColor: true,
            accentColor: true,
            phone: true,
            email: true,
            address: true,
          },
        },
      },
    });

    // ------------------------------------------------------------------
    // 1) Entrees du jour par mode transit et mode de paiement
    //    + 8/9) Avances vs Recettes (paye sur colis pas-encore-en-stock-dest
    //    vs colis-deja-en-stock-dest)
    // ------------------------------------------------------------------
    const payments = await prisma.payment.findMany({
      where: {
        agencyId,
        isVoided: false,
        createdAt: windowFilter,
      },
      include: {
        invoice: {
          select: {
            id: true,
            parcels: {
              select: {
                id: true,
                status: true,
                warehouseId: true,
                destinationAgencyId: true,
                warehouse: { select: { agencyId: true } },
                transitRoute: { select: { id: true, name: true, type: true } },
              },
            },
          },
        },
        parcel: {
          select: {
            id: true,
            status: true,
            warehouseId: true,
            destinationAgencyId: true,
            warehouse: { select: { agencyId: true } },
            transitRoute: { select: { id: true, name: true, type: true } },
          },
        },
      },
    });

    const entriesByTransitMethod: Record<
      string,
      { type: string; methods: Record<string, number>; total: number }
    > = {};
    const advanceByRouteAndMethod: Record<string, PaymentRouteMethodAgg> = {};
    const recetteByRouteAndMethod: Record<string, PaymentRouteMethodAgg> = {};
    let paymentsTotal = 0;
    let advancesTotal = 0;
    let recetteTotal = 0;

    for (const pay of payments) {
      // Resolution route + statut "en stock destination" :
      //  - si pay.parcel : scope colis
      //  - sinon : parcours des colis de la facture (route mixte possible)
      const parcelsCtx = pay.parcel ? [pay.parcel] : pay.invoice?.parcels ?? [];
      const routeSet = new Set(parcelsCtx.map((p) => p.transitRoute?.id ?? null));
      let route: { id: string | null; name: string; type: string | null };
      if (routeSet.size === 1) {
        const r = parcelsCtx[0]?.transitRoute;
        route = { id: r?.id ?? null, name: r?.name ?? 'Sans route', type: r?.type ?? null };
      } else if (routeSet.size > 1) {
        route = { id: null, name: 'Mixte', type: null };
      } else {
        route = { id: null, name: 'Sans route', type: null };
      }

      // "En stock destination" = au moins un colis du paiement est IN_STOCK
      // dans un warehouse de son destinationAgency. Si OUI -> recette ; sinon
      // -> avance (paiement avant arrivee en stock destination).
      const isAtDestination = parcelsCtx.some(
        (p) =>
          p.status === 'IN_STOCK' &&
          p.warehouseId &&
          p.warehouse?.agencyId &&
          p.destinationAgencyId &&
          p.warehouse.agencyId === p.destinationAgencyId,
      );

      const amount = Number(pay.amount);
      paymentsTotal += amount;

      // 1) Entrees par type de transit + methode
      const transitType = route.type ?? 'OTHER';
      entriesByTransitMethod[transitType] ??= { type: transitType, methods: {}, total: 0 };
      entriesByTransitMethod[transitType].methods[pay.paymentMethod] =
        (entriesByTransitMethod[transitType].methods[pay.paymentMethod] ?? 0) + amount;
      entriesByTransitMethod[transitType].total += amount;

      const bucket = isAtDestination ? recetteByRouteAndMethod : advanceByRouteAndMethod;
      if (isAtDestination) recetteTotal += amount;
      else advancesTotal += amount;

      const key = route.id ?? route.name;
      bucket[key] ??= { routeId: route.id, routeName: route.name, type: route.type, methods: {}, total: 0 };
      bucket[key].methods[pay.paymentMethod] = (bucket[key].methods[pay.paymentMethod] ?? 0) + amount;
      bucket[key].total += amount;
    }

    // ------------------------------------------------------------------
    // 2) Flux de colis du jour par route : ENTREES (colis enregistres /
    //    receptionnes dans l'agence) et SORTIES (colis charges dans un
    //    conteneur partant de l'agence). Masse + volume par route.
    // ------------------------------------------------------------------
    // Entrees : colis crees ce jour, rattaches a l'agence (magasin ou
    // destination).
    const flowInParcels = await prisma.parcel.findMany({
      where: {
        isDeleted: false,
        createdAt: windowFilter,
        OR: [
          { warehouse: { agencyId } },
          { destinationAgencyId: agencyId },
        ],
      },
      select: {
        id: true,
        weight: true,
        volume: true,
        price: true,
        transitRoute: { select: { id: true, name: true, type: true } },
      },
    });

    // Sorties : colis charges dans un conteneur partant de cette agence ce
    // jour. On lit l'historique colis (action LOADED_INTO_CONTAINER) borne a
    // la fenetre, filtre sur les conteneurs dont l'agence de depart = agence.
    const loadEvents = await prisma.parcelHistory.findMany({
      where: {
        action: 'LOADED_INTO_CONTAINER',
        createdAt: windowFilter,
        container: { departureAgencyId: agencyId },
      },
      select: {
        parcel: {
          select: {
            id: true,
            weight: true,
            volume: true,
            price: true,
            transitRoute: { select: { id: true, name: true, type: true } },
          },
        },
      },
    });

    const aggregateFlow = (
      items: Array<{
        weight: unknown;
        volume: unknown;
        price?: unknown;
        transitRoute: { id: string; name: string; type: string } | null;
      }>,
    ) => {
      const byRoute: Record<RouteKey, ParcelMassVolAgg> = {};
      let totalWeight = 0;
      let totalVolume = 0;
      for (const p of items) {
        const key = bumpRoute(byRoute as any, p.transitRoute);
        const slot = byRoute[key] as ParcelMassVolAgg;
        if (!('count' in slot)) {
          Object.assign(slot, { count: 0, totalWeight: 0, totalVolume: 0, totalPrice: 0 });
        }
        slot.count += 1;
        slot.totalWeight += Number(p.weight ?? 0);
        slot.totalVolume += Number(p.volume ?? 0);
        slot.totalPrice += Number(p.price ?? 0);
        totalWeight += Number(p.weight ?? 0);
        totalVolume += Number(p.volume ?? 0);
      }
      return { byRoute, totalWeight, totalVolume, count: items.length };
    };

    const flowIn = aggregateFlow(flowInParcels);
    const flowOut = aggregateFlow(
      // Dedup : un colis peut avoir plusieurs evenements de chargement.
      Array.from(
        new Map(loadEvents.map((e) => [e.parcel.id, e.parcel])).values(),
      ),
    );
    // Compat ascendante : l'ancien champ registeredByRoute = entrees du flux.
    const registeredByRoute = flowIn.byRoute;
    const registeredTotalWeight = flowIn.totalWeight;
    const registeredTotalVolume = flowIn.totalVolume;
    const newParcels = flowInParcels;

    // ------------------------------------------------------------------
    // 3) Conteneurs RECUS dans la journee a cette agence (actualArrivalDate
    //    dans la fenetre, arrivalAgencyId = agence)
    // 4) Conteneurs ENVOYES dans la journee depuis cette agence
    //    (departureDate dans la fenetre, departureAgencyId = agence)
    // ------------------------------------------------------------------
    const [receivedContainers, sentContainers] = await Promise.all([
      prisma.container.findMany({
        where: {
          isDeleted: false,
          arrivalAgencyId: agencyId,
          actualArrivalDate: windowFilter,
        },
        include: {
          transitRoute: { select: { id: true, name: true, type: true } },
          parcels: {
            select: {
              weight: true,
              volume: true,
              transitRoute: { select: { id: true, name: true, type: true } },
            },
          },
        },
      }),
      prisma.container.findMany({
        where: {
          isDeleted: false,
          departureAgencyId: agencyId,
          departureDate: windowFilter,
        },
        include: {
          transitRoute: { select: { id: true, name: true, type: true } },
          parcels: {
            select: {
              weight: true,
              volume: true,
              transitRoute: { select: { id: true, name: true, type: true } },
            },
          },
        },
      }),
    ]);

    const summarizeContainer = (c: typeof receivedContainers[number]): ContainerRow => {
      const byRoute: Record<RouteKey, ContainerRouteAgg> = {};
      let totalWeight = 0;
      let totalVolume = 0;
      for (const p of c.parcels) {
        const r = p.transitRoute ?? c.transitRoute;
        const key = routeKeyOf(r);
        byRoute[key] ??= {
          routeId: r?.id ?? null,
          routeName: r?.name ?? 'Sans route',
          type: r?.type ?? null,
          count: 0,
          totalWeight: 0,
          totalVolume: 0,
        };
        byRoute[key].count += 1;
        byRoute[key].totalWeight += Number(p.weight ?? 0);
        byRoute[key].totalVolume += Number(p.volume ?? 0);
        totalWeight += Number(p.weight ?? 0);
        totalVolume += Number(p.volume ?? 0);
      }
      return {
        id: c.id,
        designation: c.designation,
        type: c.type,
        status: c.status,
        routeId: c.transitRoute?.id ?? null,
        routeName: c.transitRoute?.name ?? 'Sans route',
        loadingDate: c.loadingDate ? c.loadingDate.toISOString() : null,
        departureDate: c.departureDate ? c.departureDate.toISOString() : null,
        arrivalDate: c.actualArrivalDate ? c.actualArrivalDate.toISOString() : null,
        parcels: c.parcels.length,
        totalWeight,
        totalVolume,
        byRoute,
      };
    };

    const receivedContainersList = receivedContainers.map(summarizeContainer);
    const sentContainersList = sentContainers.map(summarizeContainer);

    // ------------------------------------------------------------------
    // 5) Stock IN/OUT par route (arrivalDate / pickupDate dans la fenetre)
    // ------------------------------------------------------------------
    const [stockIn, stockOut] = await Promise.all([
      prisma.parcel.findMany({
        where: {
          isDeleted: false,
          arrivalDate: windowFilter,
          OR: [{ warehouse: { agencyId } }, { destinationAgencyId: agencyId }],
        },
        select: {
          weight: true,
          volume: true,
          price: true,
          transitRoute: { select: { id: true, name: true, type: true } },
        },
      }),
      prisma.parcel.findMany({
        where: {
          isDeleted: false,
          pickupDate: windowFilter,
          OR: [{ warehouse: { agencyId } }, { destinationAgencyId: agencyId }],
        },
        select: {
          weight: true,
          volume: true,
          price: true,
          transitRoute: { select: { id: true, name: true, type: true } },
        },
      }),
    ]);

    const aggregateMassVol = (items: typeof stockIn) => {
      const buckets: Record<RouteKey, ParcelMassVolAgg> = {};
      let totalWeight = 0;
      let totalVolume = 0;
      let totalPrice = 0;
      for (const p of items) {
        const r = p.transitRoute;
        const key = routeKeyOf(r);
        buckets[key] ??= {
          routeId: r?.id ?? null,
          routeName: r?.name ?? 'Sans route',
          type: r?.type ?? null,
          count: 0,
          totalWeight: 0,
          totalVolume: 0,
          totalPrice: 0,
        };
        buckets[key].count += 1;
        buckets[key].totalWeight += Number(p.weight ?? 0);
        buckets[key].totalVolume += Number(p.volume ?? 0);
        buckets[key].totalPrice += Number(p.price ?? 0);
        totalWeight += Number(p.weight ?? 0);
        totalVolume += Number(p.volume ?? 0);
        totalPrice += Number(p.price ?? 0);
      }
      return { buckets, totalWeight, totalVolume, totalPrice };
    };

    const stockInAgg = aggregateMassVol(stockIn);
    const stockOutAgg = aggregateMassVol(stockOut);

    // ------------------------------------------------------------------
    // 6) Etat de stock par route + valeur totale (snapshot a windowEnd)
    // ------------------------------------------------------------------
    const currentStock = await prisma.parcel.findMany({
      where: {
        isDeleted: false,
        status: 'IN_STOCK',
        warehouse: { agencyId },
      },
      select: {
        weight: true,
        volume: true,
        price: true,
        declaredValue: true,
        transitRoute: { select: { id: true, name: true, type: true } },
      },
    });

    const stockStateAgg = aggregateMassVol(currentStock);
    const stockTotalValue = currentStock.reduce(
      (s, p) => s + Number(p.declaredValue ?? p.price ?? 0),
      0,
    );

    // ------------------------------------------------------------------
    // 7) Inventaires de la journee sur les magasins de l'agence
    // ------------------------------------------------------------------
    const inventories = await prisma.warehouseInventory.findMany({
      where: {
        warehouse: { agencyId },
        OR: [
          { startedAt: windowFilter },
          { closedAt: windowFilter },
        ],
      },
      include: {
        warehouse: { select: { id: true, name: true } },
        startedBy: { select: { firstName: true, lastName: true } },
        closedBy: { select: { firstName: true, lastName: true } },
        items: { select: { expected: true, scanned: true } },
      },
    });
    const inventoryList = inventories.map((inv) => ({
      id: inv.id,
      warehouse: inv.warehouse.name,
      status: inv.status,
      startedAt: inv.startedAt.toISOString(),
      closedAt: inv.closedAt ? inv.closedAt.toISOString() : null,
      expected: inv.items.filter((i) => i.expected).length,
      scanned: inv.items.filter((i) => i.scanned).length,
      missing: inv.items.filter((i) => i.expected && !i.scanned).length,
      comment: inv.comment,
    }));

    // ------------------------------------------------------------------
    // 10) Depenses + bons de decaissement (pour profits)
    // ------------------------------------------------------------------
    const [disbursements, expenses] = await Promise.all([
      prisma.disbursementVoucher.findMany({
        where: { agencyId, createdAt: windowFilter },
      }),
      prisma.expense.findMany({
        where: { agencyId, createdAt: windowFilter },
        select: { id: true, title: true, reason: true, category: true, amount: true, createdAt: true },
      }),
    ]);
    const expensesList = expenses.map((e) => ({
      id: e.id,
      title: e.title,
      reason: e.reason,
      category: e.category,
      amount: Number(e.amount),
      createdAt: e.createdAt.toISOString(),
    }));
    const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);

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

    // ------------------------------------------------------------------
    // 11) Solde caisse apres entrees/sorties + profit
    // ------------------------------------------------------------------
    const cashSnapshot = cashRegister
      ? {
          id: cashRegister.id,
          date: cashRegister.date.toISOString(),
          isClosed: cashRegister.isClosed,
          openedAt: cashRegister.createdAt.toISOString(),
          closedAt: cashRegister.closedAt ? cashRegister.closedAt.toISOString() : null,
          closedBy: cashRegister.closedBy
            ? `${cashRegister.closedBy.firstName} ${cashRegister.closedBy.lastName}`
            : null,
          openingBalance: Number(cashRegister.openingBalance),
          totalEntries: Number(cashRegister.totalEntries),
          totalExits: Number(cashRegister.totalExits),
          currentBalance: Number(cashRegister.currentBalance),
          closingBalance: cashRegister.closingBalance ? Number(cashRegister.closingBalance) : null,
        }
      : null;

    // Profit "brut journee" = recettes encaissees - depenses (incl. salaires
    // et autres expenses). Les avances ne comptent pas comme realises tant
    // que les colis ne sont pas en stock dest (definition fournie par metier).
    const profit = recetteTotal - expensesTotal;

    const payload = {
      // --- Meta ---
      generatedAt: new Date().toISOString(),
      window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
      organization: agency?.organization ?? null,
      agency: agency
        ? {
            id: agency.id,
            name: agency.name,
            code: agency.code,
            address: agency.address,
            city: agency.city,
            country: agency.country,
            phone: agency.phone,
            email: agency.email,
          }
        : null,

      // --- Section 1 : Entrees par transit + methode ---
      entriesByTransitMethod,

      // --- Section 2 : Flux de colis du jour par route (entrees + sorties) ---
      flow: {
        in: {
          byRoute: flowIn.byRoute,
          count: flowIn.count,
          totalWeight: flowIn.totalWeight,
          totalVolume: flowIn.totalVolume,
        },
        out: {
          byRoute: flowOut.byRoute,
          count: flowOut.count,
          totalWeight: flowOut.totalWeight,
          totalVolume: flowOut.totalVolume,
        },
      },
      // Compat ascendante : ancien champ = entrees du flux.
      registeredByRoute,
      registeredTotal: {
        count: newParcels.length,
        totalWeight: registeredTotalWeight,
        totalVolume: registeredTotalVolume,
      },

      // --- Section 3 : Conteneurs recus ---
      receivedContainers: receivedContainersList,

      // --- Section 4 : Conteneurs envoyes ---
      sentContainers: sentContainersList,

      // --- Section 5 : Mouvements de stock (in/out) par route ---
      stockIn: { byRoute: stockInAgg.buckets, totalWeight: stockInAgg.totalWeight, totalVolume: stockInAgg.totalVolume },
      stockOut: { byRoute: stockOutAgg.buckets, totalWeight: stockOutAgg.totalWeight, totalVolume: stockOutAgg.totalVolume },

      // --- Section 6 : Etat de stock courant + valeur ---
      stockState: { byRoute: stockStateAgg.buckets, totalWeight: stockStateAgg.totalWeight, totalVolume: stockStateAgg.totalVolume, totalValue: stockTotalValue },

      // --- Section 7 : Inventaires du jour ---
      inventories: inventoryList,

      // --- Section 8 : Avances (paiements avant arrivee en stock dest) ---
      advancesByRouteAndMethod: advanceByRouteAndMethod,
      advancesTotal,

      // --- Section 9 : Recettes (paiements sur colis en stock dest) ---
      recetteByRouteAndMethod,
      recetteTotal,

      // --- Section 10 : Profit estime ---
      expenses: expensesList,
      expensesTotal,
      disbursementsByCategory,
      disbursementsTotal,
      disbursementsVoided,
      profit,

      // --- Section 11 : Solde caisse ---
      cashRegister: cashSnapshot,

      // --- Total paiements (compat ascendante) ---
      paymentsTotal,
      totalParcels: newParcels.length,
      totalRemainingAmount: 0,
    };

    // Upsert : un rapport unique par agence/jour. On peut le regenerer tant
    // que le statut n'est pas CLOSED (cloture manuelle/auto).
    const existing = await prisma.agencyDailyReport.findUnique({
      where: { agencyId_date: { agencyId, date: dayStart } },
    });

    const payloadJson = payload as unknown as Prisma.InputJsonValue;
    const saved = existing
      ? await prisma.agencyDailyReport.update({
          where: { id: existing.id },
          data: { payload: payloadJson, generatedAt: new Date() },
        })
      : await prisma.agencyDailyReport.create({
          data: { agencyId, date: dayStart, payload: payloadJson },
        });

    return { id: saved.id, payload };
  }
}

export const DAILY_REPORT_SERVICE = Symbol.for('DailyReportService');
