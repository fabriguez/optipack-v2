import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { PDFService } from '../../../application/services/PDFService';
import type { InvoiceData } from '../../../application/services/PDFService';
import { ExcelService } from '../../../infrastructure/excel/ExcelService';

/**
 * Calcule la part de frais de magasinage par colis d'une facture. Reproduit
 * la logique de ComputeStorageFeeUseCase sans passer par le container DI
 * (cette route est handler-based, pas use-case). Retourne un objet par parcelId.
 */
async function computeStorageFeesForInvoice(invoiceId: string): Promise<{
  perParcel: Map<string, { fee: number; days: number }>;
  total: number;
}> {
  const parcels = await prisma.parcel.findMany({
    where: { invoiceId },
    select: {
      id: true,
      weight: true,
      volume: true,
      warehouseEnteredAt: true,
      createdAt: true,
      lastContainerId: true,
      transitRouteId: true,
      transitRoute: { select: { type: true } },
      warehouse: {
        select: {
          storageFreeDays: true,
          storageDailyRate: true,
          storageFeeRules: true,
        },
      },
    },
  });
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const perParcel = new Map<string, { fee: number; days: number }>();
  let total = 0;

  const inRange = (val: number | null, min: number | null, max: number | null) => {
    if (val == null) return min == null && max == null;
    if (min != null && val < min) return false;
    if (max != null && val > max) return false;
    return true;
  };

  for (const p of parcels) {
    if (!p.lastContainerId || !p.warehouse) {
      perParcel.set(p.id, { fee: 0, days: 0 });
      continue;
    }
    const enteredAt = p.warehouseEnteredAt ?? p.createdAt;
    const days = Math.max(0, Math.floor((now - new Date(enteredAt).getTime()) / ONE_DAY));
    const w = p.weight != null ? Number(p.weight) : null;
    const v = p.volume != null ? Number(p.volume) : null;
    const type = p.transitRoute?.type ?? null;

    let rule: typeof p.warehouse.storageFeeRules[number] | null = null;
    if (type) {
      const candidates = p.warehouse.storageFeeRules.filter((r) => {
        if (!r.isActive) return false;
        if (r.transitType !== type) return false;
        if (r.transitRouteId && r.transitRouteId !== p.transitRouteId) return false;
        const minW = r.minWeight != null ? Number(r.minWeight) : null;
        const maxW = r.maxWeight != null ? Number(r.maxWeight) : null;
        const minV = r.minVolume != null ? Number(r.minVolume) : null;
        const maxV = r.maxVolume != null ? Number(r.maxVolume) : null;
        const hasW = minW != null || maxW != null;
        const hasV = minV != null || maxV != null;
        if (type === 'AIR') return hasW ? inRange(w, minW, maxW) : true;
        if (type === 'SEA') return hasV ? inRange(v, minV, maxV) : true;
        if (hasW && hasV) return inRange(w, minW, maxW) && inRange(v, minV, maxV);
        if (hasW) return inRange(w, minW, maxW);
        if (hasV) return inRange(v, minV, maxV);
        return true;
      });
      candidates.sort((a, b) => {
        const aScoped = a.transitRouteId === p.transitRouteId ? 1 : 0;
        const bScoped = b.transitRouteId === p.transitRouteId ? 1 : 0;
        if (aScoped !== bScoped) return bScoped - aScoped;
        if (a.priority !== b.priority) return b.priority - a.priority;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
      rule = candidates[0] ?? null;
    }

    const freeDays = rule ? rule.freeDays : p.warehouse.storageFreeDays;
    const rate = rule ? Number(rule.dailyRate) : Number(p.warehouse.storageDailyRate);
    const chargeable = Math.max(0, days - freeDays);
    const fee = chargeable * rate;
    perParcel.set(p.id, { fee, days: chargeable });
    total += fee;
  }
  return { perParcel, total };
}

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, sortOrder = 'desc' } = req.query as any;
    const skip = (Number(page) - 1) * Number(limit);
    const status = req.query.status as string | undefined;
    const clientId = req.query.clientId as string | undefined;
    const agencyId = req.query.agencyId as string | undefined;

    // Recherche elargie : reference facture, nom/telephone/email client, et
    // tracking number d'un colis lie. Permet a la barre de recherche du
    // form paiement de trouver vite la facture via le bordereau papier
    // (tracking) ou un appel client (telephone).
    const where: any = {
      isActive: true,
      ...(status && { status }),
      ...(clientId && { clientId }),
      ...(agencyId && { agencyId }),
      ...(search && {
        OR: [
          { reference: { contains: search, mode: 'insensitive' } },
          { client: { fullName: { contains: search, mode: 'insensitive' } } },
          { client: { phone: { contains: search, mode: 'insensitive' } } },
          { client: { email: { contains: search, mode: 'insensitive' } } },
          { parcels: { some: { trackingNumber: { contains: search, mode: 'insensitive' } } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.invoice.findMany({
        where, skip, take: Number(limit),
        orderBy: { createdAt: sortOrder },
        include: {
          client: { select: { id: true, fullName: true, phone: true } },
          agency: { select: { id: true, name: true, code: true } },
          parcels: { select: { id: true, trackingNumber: true, designation: true } },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    res.json({
      success: true,
      data,
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { id: true, fullName: true, phone: true, email: true } },
        agency: { select: { id: true, name: true, code: true, address: true, phone: true } },
        parcels: { select: { id: true, trackingNumber: true, designation: true, weight: true, volume: true, destination: true, price: true } },
        payments: { orderBy: { createdAt: 'asc' }, include: { agency: { select: { name: true } }, receivedBy: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Facture introuvable' });
    const storage = await computeStorageFeesForInvoice(invoice.id);
    // On enrichit la reponse avec le breakdown des frais magasinage par colis
    // et le total : l'UI peut afficher la ligne dediee + le detail par colis.
    const enriched = {
      ...invoice,
      parcels: (invoice as any).parcels?.map((p: any) => ({
        ...p,
        storageFee: storage.perParcel.get(p.id)?.fee ?? 0,
        storageDays: storage.perParcel.get(p.id)?.days ?? 0,
      })),
      storageFeesTotal: storage.total,
    };
    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
});

// Generate invoice PDF
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { id: true, fullName: true, phone: true, email: true } },
        agency: { select: { id: true, name: true, code: true, address: true, phone: true } },
        parcels: { select: { id: true, trackingNumber: true, designation: true, weight: true, volume: true, destination: true, price: true } },
        payments: {
          orderBy: { createdAt: 'asc' },
          include: {
            agency: { select: { name: true } },
            receivedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Facture introuvable' });
    }

    // Calcul des frais de magasinage par colis a l'instant T. On les rend
    // visibles sur la facture pour transparence (non additionnes au netAmount
    // tant que la matrice configurable n'est pas implementee -- voir todo
    // differe).
    const storage = await computeStorageFeesForInvoice(invoice.id);

    const invoiceData: InvoiceData = {
      reference: invoice.reference,
      createdAt: invoice.createdAt,
      client: {
        fullName: invoice.client.fullName,
        phone: invoice.client.phone,
        email: invoice.client.email,
      },
      agency: invoice.agency
        ? { name: invoice.agency.name, code: invoice.agency.code, address: invoice.agency.address, phone: invoice.agency.phone }
        : null,
      // Audit fix #5 : 1 facture peut couvrir N colis (toujours un array maintenant)
      parcel: ((invoice as unknown as { parcels?: any[] }).parcels ?? []).map((p: any) => {
        const s = storage.perParcel.get(p.id);
        return {
          trackingNumber: p.trackingNumber,
          designation: p.designation,
          weight: p.weight != null ? Number(p.weight) : null,
          volume: p.volume != null ? Number(p.volume) : null,
          destination: p.destination,
          price: Number(p.price),
          storageFee: s?.fee ?? 0,
          storageDays: s?.days ?? 0,
        };
      }),
      payments: invoice.payments.map((p: any) => ({
        createdAt: p.createdAt,
        method: p.method,
        amount: Number(p.amount),
        agency: p.agency,
      })),
      totalAmount: Number((invoice as any).totalAmount ?? 0),
      discount: Number((invoice as any).discount ?? 0),
      tax: Number((invoice as any).tax ?? 0),
      netAmount: Number((invoice as any).netAmount ?? 0),
      paidAmount: Number((invoice as any).paidAmount ?? 0),
      balance: Number((invoice as any).balance ?? 0),
      storageFeesTotal: storage.total,
    };

    const pdfBuffer = await PDFService.generateInvoicePDF(invoiceData);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="facture-${invoice.reference}.pdf"`,
      'Content-Length': pdfBuffer.length.toString(),
    });
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

/**
 * Export XLSX d'une facture : une ligne par colis avec montant + frais
 * magasinage + part allouee de l'avance/solde. Utile pour la compta / export
 * comptable client.
 */
router.get('/:id/xlsx', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { fullName: true, phone: true, email: true } },
        agency: { select: { name: true, code: true } },
        parcels: { select: { id: true, trackingNumber: true, designation: true, weight: true, volume: true, destination: true, price: true } },
        payments: { orderBy: { createdAt: 'asc' }, select: { createdAt: true, paymentMethod: true, amount: true } },
      },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Facture introuvable' });

    const storage = await computeStorageFeesForInvoice(invoice.id);
    const excel = new ExcelService();
    const parcelRows = ((invoice as any).parcels ?? []).map((p: any, i: number) => {
      const s = storage.perParcel.get(p.id);
      return {
        num: i + 1,
        tracking: p.trackingNumber || '-',
        designation: p.designation,
        weight: p.weight != null ? Number(p.weight) : '',
        destination: p.destination || '',
        price: Number(p.price),
        storageDays: s?.days ?? 0,
        storageFee: s?.fee ?? 0,
        totalLine: Number(p.price) + (s?.fee ?? 0),
      };
    });

    const buf = await excel.generate(
      `Facture ${invoice.reference}`,
      [
        { key: 'num', header: '#', width: 6 },
        { key: 'tracking', header: 'Tracking', width: 18 },
        { key: 'designation', header: 'Designation', width: 28 },
        { key: 'weight', header: 'Masse (kg)', width: 12 },
        { key: 'destination', header: 'Destination', width: 18 },
        { key: 'price', header: 'Prix transport', width: 14 },
        { key: 'storageDays', header: 'Jrs magasinage', width: 14 },
        { key: 'storageFee', header: 'Frais magasinage', width: 14 },
        { key: 'totalLine', header: 'Total ligne', width: 14 },
      ],
      parcelRows,
    );

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="facture-${invoice.reference}.xlsx"`,
      'Content-Length': buf.length.toString(),
    });
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

export default router;
