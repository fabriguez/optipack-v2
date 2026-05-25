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

interface ManifestRef {
  id: string;
  number: string;
  type: 'DISPATCH' | 'RECEPTION';
  createdAt: string;
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
  /** Bordereaux d'envoi/reception lies au conteneur. */
  manifests: ManifestRef[];
  /** True si le conteneur a des discrepancies -> generer aussi bordereau comparaison. */
  hasComparison: boolean;
}

interface ParcelLite {
  id: string;
  weight: Prisma.Decimal | null;
  volume: Prisma.Decimal | null;
  price: Prisma.Decimal;
  transitRoute: { id: string; name: string; type: string } | null;
}

function routeKeyOf(route: { id?: string | null } | null | undefined): string {
  return route?.id ?? '__none__';
}

function emptyMassVol(route: { id?: string | null; name?: string | null; type?: string | null } | null | undefined): ParcelMassVolAgg {
  return {
    routeId: route?.id ?? null,
    routeName: route?.name ?? 'Sans route',
    type: route?.type ?? null,
    count: 0,
    totalWeight: 0,
    totalVolume: 0,
    totalPrice: 0,
  };
}

function aggregateParcels(items: ParcelLite[]) {
  const byRoute: Record<RouteKey, ParcelMassVolAgg> = {};
  let totalWeight = 0;
  let totalVolume = 0;
  let totalPrice = 0;
  for (const p of items) {
    const r = p.transitRoute;
    const key = routeKeyOf(r);
    byRoute[key] ??= emptyMassVol(r);
    byRoute[key].count += 1;
    byRoute[key].totalWeight += Number(p.weight ?? 0);
    byRoute[key].totalVolume += Number(p.volume ?? 0);
    byRoute[key].totalPrice += Number(p.price ?? 0);
    totalWeight += Number(p.weight ?? 0);
    totalVolume += Number(p.volume ?? 0);
    totalPrice += Number(p.price ?? 0);
  }
  return { byRoute, count: items.length, totalWeight, totalVolume, totalPrice };
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
    // Resolution du jour calendaire dans le fuseau de l'agence + snap au
    // prochain jour ouvrable si necessaire. Generer un rapport pour un jour
    // non-ouvre (ex: dimanche) -> redirige vers le prochain jour ouvre (lundi).
    const agencyTz = await prisma.agency.findUnique({
      where: { id: agencyId },
      select: { timezone: true },
    });
    const tz = agencyTz?.timezone || 'Africa/Douala';
    let dayStart = startOfDayInTimezone(date, tz);

    // Snap au prochain jour ouvrable de l'agence.
    const openingHours = await prisma.agencyOpeningHours.findMany({
      where: { agencyId, isOpen: true },
      select: { dayOfWeek: true },
    });
    if (openingHours.length > 0) {
      const openDays = new Set(openingHours.map((h) => h.dayOfWeek));
      // Calcule le dayOfWeek de dayStart dans le fuseau agence.
      const dowFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
      const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      let dow = dowMap[dowFmt.format(dayStart).slice(0, 3)] ?? dayStart.getUTCDay();
      let safety = 0;
      while (!openDays.has(dow) && safety < 7) {
        dayStart = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        dow = dowMap[dowFmt.format(dayStart).slice(0, 3)] ?? dayStart.getUTCDay();
        safety += 1;
      }
    }

    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    // Fenetre = session caisse si existante, sinon jour calendaire.
    // On match aussi en bornant la date au jour entier pour tolerer les
    // ecarts de stockage @db.Date (Prisma peut stocker en UTC).
    const cashRegister = await prisma.agencyCashRegister.findFirst({
      where: { agencyId, date: { gte: dayStart, lt: dayEnd } },
      include: { closedBy: { select: { firstName: true, lastName: true } } },
    });

    const windowStart = cashRegister?.createdAt ?? dayStart;
    const windowEnd = cashRegister?.closedAt ?? new Date();
    const windowFilter = { gte: windowStart, lt: windowEnd };

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
    // 1) Entrees du jour par mode transit + methode
    //    + 8/9) Recettes vs Avances avec PRORATA par prix colis
    //
    // Regle metier validee :
    //  - Attribution = payment.agencyId (agence qui encaisse, status quo).
    //  - Recette part = amount * (somme prix colis "a destination" /
    //    somme prix de tous les colis du paiement). Reste = avance.
    //  - "A destination" = colis dont status IN [IN_STOCK, DELIVERED] ET
    //    warehouse courant appartient a son destinationAgencyId.
    //  - DELIVERED inclus : un colis retire par le client etait bien arrive.
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
                price: true,
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
            price: true,
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

    // Classification basee sur la TIMING : un paiement est une recette si
    // son createdAt est posterieur a la date a laquelle le colis est passe
    // en statut RECEIVED (receptionne). Sinon = paiement en avance.
    //
    // On precharge la date de reception de chaque colis lie aux paiements
    // (premiere occurrence d'un ParcelHistory avec statusAfter='RECEIVED').
    const allParcelIds = new Set<string>();
    for (const pay of payments) {
      if (pay.parcel) allParcelIds.add(pay.parcel.id);
      for (const p of pay.invoice?.parcels ?? []) allParcelIds.add(p.id);
    }
    const receivedAtByParcel = new Map<string, Date>();
    if (allParcelIds.size > 0) {
      const receivedHistories = await prisma.parcelHistory.findMany({
        where: {
          parcelId: { in: Array.from(allParcelIds) },
          statusAfter: 'RECEIVED',
        },
        select: { parcelId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      for (const h of receivedHistories) {
        if (!receivedAtByParcel.has(h.parcelId)) {
          receivedAtByParcel.set(h.parcelId, h.createdAt);
        }
      }
    }

    // Construit un map parcelId -> status courant pour filtre strict.
    const parcelStatusMap = new Map<string, string>();
    for (const pay of payments) {
      if (pay.parcel) parcelStatusMap.set(pay.parcel.id, pay.parcel.status);
      for (const p of pay.invoice?.parcels ?? []) parcelStatusMap.set(p.id, p.status);
    }

    // Recette = colis ACTUELLEMENT receptionne (RECEIVED ou DELIVERED) ET
    // paiement effectue APRES la reception. Tous les autres cas -> avance.
    // Cas particuliers :
    //  - colis pas encore receptionne (status IN_STOCK/LOADING/IN_TRANSIT/
    //    ARRIVED/LOST) -> avance, quelle que soit la date paiement.
    //  - colis receptionne MAIS paiement anterieur a la reception -> avance.
    const isPaymentAfterReception = (parcelId: string, paymentDate: Date) => {
      const currentStatus = parcelStatusMap.get(parcelId);
      if (currentStatus !== 'RECEIVED' && currentStatus !== 'DELIVERED') return false;
      const receivedAt = receivedAtByParcel.get(parcelId);
      return !!receivedAt && paymentDate >= receivedAt;
    };

    const routeOf = (p: { transitRoute: { id: string; name: string; type: string } | null }) => ({
      id: p.transitRoute?.id ?? null,
      name: p.transitRoute?.name ?? 'Sans route',
      type: p.transitRoute?.type ?? null,
    });

    const bumpPayBucket = (
      bucket: Record<string, PaymentRouteMethodAgg>,
      route: { id: string | null; name: string; type: string | null },
      method: string,
      amount: number,
    ) => {
      const key = route.id ?? route.name;
      bucket[key] ??= { routeId: route.id, routeName: route.name, type: route.type, methods: {}, total: 0 };
      bucket[key].methods[method] = (bucket[key].methods[method] ?? 0) + amount;
      bucket[key].total += amount;
    };

    for (const pay of payments) {
      const parcelsCtx = pay.parcel ? [pay.parcel] : pay.invoice?.parcels ?? [];
      const amount = Number(pay.amount);
      paymentsTotal += amount;

      // 1) Section 1 : entrees par type transit + methode (sur le paiement
      //    entier, route majoritaire ou "Mixte").
      const routeSet = new Set(parcelsCtx.map((p) => p.transitRoute?.id ?? null));
      const transitType =
        routeSet.size === 1
          ? parcelsCtx[0]?.transitRoute?.type ?? 'OTHER'
          : routeSet.size > 1
          ? 'MIXED'
          : 'OTHER';
      entriesByTransitMethod[transitType] ??= { type: transitType, methods: {}, total: 0 };
      entriesByTransitMethod[transitType].methods[pay.paymentMethod] =
        (entriesByTransitMethod[transitType].methods[pay.paymentMethod] ?? 0) + amount;
      entriesByTransitMethod[transitType].total += amount;

      // 8/9) Prorata recette / avance.
      if (parcelsCtx.length === 0) {
        // Paiement sans colis ctx (ne devrait pas arriver) : tout en avance.
        const route = { id: null, name: 'Sans route', type: null };
        advancesTotal += amount;
        bumpPayBucket(advanceByRouteAndMethod, route, pay.paymentMethod, amount);
        continue;
      }

      const totalPrice = parcelsCtx.reduce((s, p) => s + Number(p.price ?? 0), 0);
      // Fallback : si tous les prix sont 0, split egalitaire entre colis.
      const equalSplit = totalPrice <= 0;

      for (const p of parcelsCtx) {
        const share = equalSplit
          ? amount / parcelsCtx.length
          : amount * (Number(p.price ?? 0) / totalPrice);
        if (share <= 0) continue;
        const route = routeOf(p);
        // Recette = paiement effectue APRES reception du colis
        // (payment.createdAt >= receivedAt). Sinon = avance.
        if (isPaymentAfterReception(p.id, pay.createdAt)) {
          recetteTotal += share;
          bumpPayBucket(recetteByRouteAndMethod, route, pay.paymentMethod, share);
        } else {
          advancesTotal += share;
          bumpPayBucket(advanceByRouteAndMethod, route, pay.paymentMethod, share);
        }
      }
    }

    // ------------------------------------------------------------------
    // 2) Flux IN : colis actuellement IN_STOCK ou RECEIVED dans l'agence.
    //    Definition metier : "le flux des entrees, ce sont les colis IN_STOCK
    //    et RECEIVED dans l'agence". Snapshot a l'instant T (windowEnd).
    // ------------------------------------------------------------------
    const flowInRawParcels = await prisma.parcel.findMany({
      where: {
        isDeleted: false,
        status: { in: ['IN_STOCK', 'RECEIVED'] },
        warehouse: { agencyId },
      },
      select: {
        id: true,
        weight: true,
        volume: true,
        price: true,
        transitRoute: { select: { id: true, name: true, type: true } },
      },
    });
    const flowInHistories = flowInRawParcels.map((p) => ({
      action: 'SNAPSHOT' as const,
      parcel: p,
    }));

    // Flux OUT : colis SORTIS de l'agence aujourd'hui.
    //  - HANDED_OVER avec warehouse de l'agence (remise client : pickup).
    //  - LOADED_INTO_CONTAINER avec container.departureAgencyId = agence.
    //  - Transfert emis = LOADED_INTO_CONTAINER (couvert ci-dessus).
    const flowOutHistories = await prisma.parcelHistory.findMany({
      where: {
        createdAt: windowFilter,
        OR: [
          {
            action: 'HANDED_OVER',
            warehouse: { agencyId },
          },
          {
            action: 'LOADED_INTO_CONTAINER',
            container: { departureAgencyId: agencyId },
          },
        ],
      },
      select: {
        action: true,
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

    // Dedup par parcelId.
    const flowInParcelsMap = new Map<string, ParcelLite>();
    for (const h of flowInHistories) {
      if (!flowInParcelsMap.has(h.parcel.id)) flowInParcelsMap.set(h.parcel.id, h.parcel);
    }
    const flowOutParcelsMap = new Map<string, ParcelLite>();
    for (const h of flowOutHistories) {
      if (!flowOutParcelsMap.has(h.parcel.id)) flowOutParcelsMap.set(h.parcel.id, h.parcel);
    }

    const flowIn = aggregateParcels(Array.from(flowInParcelsMap.values()));
    const flowOut = aggregateParcels(Array.from(flowOutParcelsMap.values()));

    // ------------------------------------------------------------------
    // 3) Conteneurs RECUS (arrivalAgencyId = agence, actualArrivalDate dans
    //    la fenetre).
    // 4) Conteneurs ENVOYES (departureAgencyId = agence, departureDate dans
    //    la fenetre).
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
          manifests: {
            where: { status: 'ACTIVE' },
            select: { id: true, number: true, type: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          },
          discrepancies: { select: { id: true } },
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
          manifests: {
            where: { status: 'ACTIVE', type: 'DISPATCH' },
            select: { id: true, number: true, type: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    ]);

    // Pour chaque conteneur on agrege les colis qui ont transite via lui :
    // currentContainer (encore charge) OU lastContainer (deja decharge).
    // Sans le fallback lastContainerId, les conteneurs RECUS affichent 0 colis
    // une fois le dechargement effectue (containerId remis a null).
    const allContainerIds = [...receivedContainers, ...sentContainers].map((c) => c.id);
    const parcelsForContainers = allContainerIds.length
      ? await prisma.parcel.findMany({
          where: {
            isDeleted: false,
            OR: [
              { containerId: { in: allContainerIds } },
              { lastContainerId: { in: allContainerIds } },
            ],
          },
          select: {
            id: true,
            containerId: true,
            lastContainerId: true,
            weight: true,
            volume: true,
            transitRoute: { select: { id: true, name: true, type: true } },
          },
        })
      : [];

    const parcelsByContainer = new Map<string, typeof parcelsForContainers>();
    for (const p of parcelsForContainers) {
      const cid = p.containerId ?? p.lastContainerId;
      if (!cid) continue;
      if (!parcelsByContainer.has(cid)) parcelsByContainer.set(cid, []);
      parcelsByContainer.get(cid)!.push(p);
    }

    const summarizeContainer = (
      c: typeof receivedContainers[number] | typeof sentContainers[number],
    ): ContainerRow => {
      const byRoute: Record<RouteKey, ContainerRouteAgg> = {};
      let totalWeight = 0;
      let totalVolume = 0;
      const parcels = parcelsByContainer.get(c.id) ?? [];
      for (const p of parcels) {
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
      const manifests: ManifestRef[] = (c.manifests ?? []).map((m: any) => ({
        id: m.id,
        number: m.number,
        type: m.type as 'DISPATCH' | 'RECEPTION',
        createdAt: m.createdAt.toISOString(),
      }));
      const hasComparison = Array.isArray((c as any).discrepancies)
        ? (c as any).discrepancies.length > 0
        : false;
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
        parcels: parcels.length,
        totalWeight,
        totalVolume,
        byRoute,
        manifests,
        hasComparison,
      };
    };

    const receivedContainersList = receivedContainers.map(summarizeContainer);
    const sentContainersList = sentContainers.map(summarizeContainer);

    // ------------------------------------------------------------------
    // 5) Mouvements de stock : transitions STRICTES vers/depuis IN_STOCK
    //    dans un magasin de l'agence (via ParcelHistory.statusBefore /
    //    statusAfter). Un colis cree directement IN_STOCK (statusBefore=null)
    //    compte aussi en stock IN.
    // ------------------------------------------------------------------
    const stockHistories = await prisma.parcelHistory.findMany({
      where: {
        createdAt: windowFilter,
        warehouse: { agencyId },
        OR: [
          { statusAfter: 'IN_STOCK', NOT: { statusBefore: 'IN_STOCK' } },
          { statusBefore: 'IN_STOCK', NOT: { statusAfter: 'IN_STOCK' } },
        ],
      },
      select: {
        statusBefore: true,
        statusAfter: true,
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

    const stockInParcels: ParcelLite[] = [];
    const stockOutParcels: ParcelLite[] = [];
    for (const h of stockHistories) {
      if (h.statusAfter === 'IN_STOCK' && h.statusBefore !== 'IN_STOCK') stockInParcels.push(h.parcel);
      if (h.statusBefore === 'IN_STOCK' && h.statusAfter !== 'IN_STOCK') stockOutParcels.push(h.parcel);
    }
    const stockInAgg = aggregateParcels(stockInParcels);
    const stockOutAgg = aggregateParcels(stockOutParcels);

    // ------------------------------------------------------------------
    // 6) Etat de stock par route + valeur totale (snapshot a l'instant T).
    //    "En stock" = IN_STOCK ou RECEIVED (receptionne, encore physiquement
    //    present dans l'agence en attente de remise au destinataire).
    //    Une fois le rapport CLOSED, la regen est refusee (cf controller)
    //    donc ce snapshot reste fige au moment de la cloture.
    // ------------------------------------------------------------------
    const currentStock = await prisma.parcel.findMany({
      where: {
        isDeleted: false,
        status: { in: ['IN_STOCK', 'RECEIVED'] },
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

    const stockStateAgg = aggregateParcels(
      currentStock.map((p) => ({
        id: '',
        weight: p.weight,
        volume: p.volume,
        price: p.price,
        transitRoute: p.transitRoute,
      })),
    );
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
    // 9bis) Transferts de fonds : sortants (sourceAgencyId = agence) et
    //       entrants (destinationAgencyId = agence). Inclut PENDING +
    //       CONFIRMED, exclut VOIDED. Cree dans la fenetre caisse.
    // ------------------------------------------------------------------
    const [outgoingTransfers, incomingTransfers] = await Promise.all([
      prisma.fundTransfer.findMany({
        where: {
          sourceAgencyId: agencyId,
          isVoided: false,
          createdAt: windowFilter,
        },
        include: {
          destinationAgency: { select: { id: true, name: true } },
          initiatedBy: { select: { firstName: true, lastName: true } },
          confirmedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.fundTransfer.findMany({
        where: {
          destinationAgencyId: agencyId,
          isVoided: false,
          createdAt: windowFilter,
        },
        include: {
          sourceAgency: { select: { id: true, name: true } },
          initiatedBy: { select: { firstName: true, lastName: true } },
          confirmedBy: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    const mapTransfer = (t: any, direction: 'OUT' | 'IN') => ({
      id: t.id,
      reference: t.reference,
      direction,
      amount: Number(t.amount),
      transferMethod: t.transferMethod,
      sourcePaymentMethod: t.sourcePaymentMethod ?? null,
      destinationPaymentMethod: t.destinationPaymentMethod ?? null,
      destinationType: t.destinationType,
      destinationLabel: t.destinationLabel ?? null,
      counterpart:
        direction === 'OUT'
          ? t.destinationAgency?.name ?? t.destinationLabel ?? t.destinationType
          : t.sourceAgency?.name ?? 'Siege',
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      initiatedBy: t.initiatedBy ? `${t.initiatedBy.firstName} ${t.initiatedBy.lastName}` : null,
      confirmedBy: t.confirmedBy ? `${t.confirmedBy.firstName} ${t.confirmedBy.lastName}` : null,
    });

    const outgoingTransfersList = outgoingTransfers.map((t) => mapTransfer(t, 'OUT'));
    const incomingTransfersList = incomingTransfers.map((t) => mapTransfer(t, 'IN'));
    const outgoingTransfersTotal = outgoingTransfersList.reduce((s, t) => s + t.amount, 0);
    const incomingTransfersTotal = incomingTransfersList.reduce((s, t) => s + t.amount, 0);

    // ------------------------------------------------------------------
    // 10) Depenses + decaissements (pour profit).
    //     Dedup : un disbursement lie a une expense (via expense.disbursementId)
    //     est exclu de la somme disbursements pour eviter le double-comptage
    //     (la depense est deja dans expensesTotal).
    // ------------------------------------------------------------------
    const [disbursements, expenses] = await Promise.all([
      prisma.disbursementVoucher.findMany({
        where: { agencyId, createdAt: windowFilter },
        include: {
          expense: { select: { id: true } },
        },
      }),
      prisma.expense.findMany({
        where: { agencyId, createdAt: windowFilter },
        select: { id: true, title: true, reason: true, category: true, amount: true, createdAt: true, disbursementId: true },
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
    let disbursementsTotalDedup = 0; // exclut ceux lies a une Expense (dedup profit)
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
        if (!d.expense) disbursementsTotalDedup += amount;
      }
    }

    // ------------------------------------------------------------------
    // 11) Solde caisse + profit.
    //     Profit = recettes - expenses - disbursements_sans_expense_lie.
    //     Les expenses payees generent un disbursement lie (PayExpense...)
    //     donc on ne compte que les disbursements "purs" (non issus d'une
    //     expense) pour eviter le double-comptage.
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

    const profit = recetteTotal - expensesTotal - disbursementsTotalDedup;

    const payload = {
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

      entriesByTransitMethod,

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
      registeredByRoute: flowIn.byRoute,
      registeredTotal: {
        count: flowIn.count,
        totalWeight: flowIn.totalWeight,
        totalVolume: flowIn.totalVolume,
      },

      receivedContainers: receivedContainersList,
      sentContainers: sentContainersList,

      stockIn: {
        byRoute: stockInAgg.byRoute,
        count: stockInAgg.count,
        totalWeight: stockInAgg.totalWeight,
        totalVolume: stockInAgg.totalVolume,
      },
      stockOut: {
        byRoute: stockOutAgg.byRoute,
        count: stockOutAgg.count,
        totalWeight: stockOutAgg.totalWeight,
        totalVolume: stockOutAgg.totalVolume,
      },

      stockState: {
        byRoute: stockStateAgg.byRoute,
        count: stockStateAgg.count,
        totalWeight: stockStateAgg.totalWeight,
        totalVolume: stockStateAgg.totalVolume,
        totalValue: stockTotalValue,
      },

      inventories: inventoryList,

      advancesByRouteAndMethod: advanceByRouteAndMethod,
      advancesTotal,

      recetteByRouteAndMethod,
      recetteTotal,

      expenses: expensesList,
      expensesTotal,
      disbursementsByCategory,
      disbursementsTotal,
      disbursementsTotalDedup,
      disbursementsVoided,
      profit,

      cashRegister: cashSnapshot,

      // Transferts de fonds (sortants + entrants) sur la fenetre.
      fundTransfersOut: outgoingTransfersList,
      fundTransfersIn: incomingTransfersList,
      fundTransfersOutTotal: outgoingTransfersTotal,
      fundTransfersInTotal: incomingTransfersTotal,

      paymentsTotal,
      totalParcels: flowIn.count,
      totalRemainingAmount: 0,
    };

    // Upsert : un rapport unique par agence/jour. Regen interdite si CLOSED
    // (verrouillage cote controller -- ici on accepte pour la 1ere generation
    // automatique au moment de la cloture caisse).
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

/**
 * Calcule le JOUR CALENDAIRE de la date passee dans le fuseau de l'agence,
 * et retourne un Date a UTC midnight de ce jour. Stocke comme @db.Date par
 * Prisma -> conserve la portion date intacte. Evite les decalages quand le
 * serveur est en UTC et le fuseau agence en UTC+1 (cas Cameroun).
 */
function startOfDayInTimezone(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), 0, 0, 0, 0));
}
