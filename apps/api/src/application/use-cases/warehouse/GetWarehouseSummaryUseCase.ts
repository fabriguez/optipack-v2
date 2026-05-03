import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

interface CategorySummary {
  category: string;
  parcelCount: number;
  expectedValue: number; // somme du reste a payer (balance) reparti par colis
  totalWeight: number;
  totalVolume: number;
}

interface RouteSummary {
  transitRouteId: string | null;
  transitRouteName: string;
  transitType: string | null;
  parcelCount: number;
  totalWeight: number;
  totalVolume: number;
}

/**
 * Resume du stock d'un magasin :
 * - colis IN_STOCK presents (isPresent=true)
 * - groupes par categorie : count + valeur attendue (= sum des balances)
 * - groupes par route de transit : count + masse + volume
 */
@injectable()
export class GetWarehouseSummaryUseCase {
  async execute(warehouseId: string) {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
      include: { agency: { select: { id: true, name: true, city: true } } },
    });
    if (!warehouse) throw new NotFoundError('Magasin', warehouseId);

    const parcels = await prisma.parcel.findMany({
      where: {
        warehouseId,
        isDeleted: false,
        status: 'IN_STOCK',
        isPresent: true,
      },
      select: {
        id: true,
        category: true,
        weight: true,
        volume: true,
        price: true,
        invoiceId: true,
        invoice: {
          select: { totalAmount: true, paidAmount: true, balance: true },
        },
        transitRoute: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    // Pour repartir le balance d'une facture entre ses colis :
    // facture.balance * (parcel.price / sum(parcel.price for parcels of facture))
    // Pre-calcul du total prix par facture pour les colis presents dans CE magasin.
    const invoicePriceSum = new Map<string, number>();
    for (const p of parcels) {
      if (!p.invoiceId) continue;
      invoicePriceSum.set(p.invoiceId, (invoicePriceSum.get(p.invoiceId) ?? 0) + Number(p.price));
    }

    const byCategory = new Map<string, CategorySummary>();
    const byRoute = new Map<string, RouteSummary>();

    for (const p of parcels) {
      const cat = p.category;
      const w = Number(p.weight ?? 0);
      const v = Number(p.volume ?? 0);
      const price = Number(p.price);

      // valeur attendue = part du balance facture imputable a ce colis
      let expected = price;
      if (p.invoice) {
        const invSum = invoicePriceSum.get(p.invoiceId!) ?? price;
        const ratio = invSum > 0 ? price / invSum : 0;
        expected = Number(p.invoice.balance) * ratio;
      }

      // Categorie
      if (!byCategory.has(cat)) {
        byCategory.set(cat, {
          category: cat,
          parcelCount: 0,
          expectedValue: 0,
          totalWeight: 0,
          totalVolume: 0,
        });
      }
      const c = byCategory.get(cat)!;
      c.parcelCount += 1;
      c.expectedValue += expected;
      c.totalWeight += w;
      c.totalVolume += v;

      // Route
      const routeId = p.transitRoute?.id ?? null;
      const routeKey = routeId ?? '__none__';
      if (!byRoute.has(routeKey)) {
        byRoute.set(routeKey, {
          transitRouteId: routeId,
          transitRouteName: p.transitRoute?.name ?? 'Sans route',
          transitType: p.transitRoute?.type ?? null,
          parcelCount: 0,
          totalWeight: 0,
          totalVolume: 0,
        });
      }
      const r = byRoute.get(routeKey)!;
      r.parcelCount += 1;
      r.totalWeight += w;
      r.totalVolume += v;
    }

    return {
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        location: warehouse.location,
        agency: warehouse.agency,
      },
      totals: {
        parcelCount: parcels.length,
        expectedValue: Array.from(byCategory.values()).reduce((s, c) => s + c.expectedValue, 0),
        totalWeight: Array.from(byCategory.values()).reduce((s, c) => s + c.totalWeight, 0),
        totalVolume: Array.from(byCategory.values()).reduce((s, c) => s + c.totalVolume, 0),
      },
      byCategory: Array.from(byCategory.values())
        .map((c) => ({
          ...c,
          expectedValue: Number(c.expectedValue.toFixed(2)),
          totalWeight: Number(c.totalWeight.toFixed(3)),
          totalVolume: Number(c.totalVolume.toFixed(3)),
        }))
        .sort((a, b) => b.parcelCount - a.parcelCount),
      byTransitRoute: Array.from(byRoute.values())
        .map((r) => ({
          ...r,
          totalWeight: Number(r.totalWeight.toFixed(3)),
          totalVolume: Number(r.totalVolume.toFixed(3)),
        }))
        .sort((a, b) => b.parcelCount - a.parcelCount),
    };
  }
}
