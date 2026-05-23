import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema, applyInvoiceDiscountSchema, type ApplyInvoiceDiscountInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { PDFService } from '../../../application/services/PDFService';
import type { InvoiceData } from '../../../application/services/PDFService';
import { ExcelService } from '../../../infrastructure/excel/ExcelService';

/**
 * Resout les ids de colis a facturer pour une facture donnee :
 *  - facture standard : colis dont invoiceId = facture
 *  - facture agregat de groupe : tous les colis du groupe lie a la facture
 * Retourne aussi la liste d'invoiceIds membres (utile pour aggreger payments).
 */
async function resolveInvoiceScope(invoiceId: string): Promise<{
  parcelIds: string[];
  memberInvoiceIds: string[];
  groupId: string | null;
}> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, parcelGroupId: true },
  });
  if (!invoice) return { parcelIds: [], memberInvoiceIds: [invoiceId], groupId: null };

  if (invoice.parcelGroupId) {
    // Facture agregat : on prend tous les colis du groupe + les factures membres.
    const parcels = await prisma.parcel.findMany({
      where: { parcelGroupId: invoice.parcelGroupId },
      select: { id: true, invoiceId: true },
    });
    const memberInvoiceIds = [
      ...new Set(parcels.map((p) => p.invoiceId).filter((id): id is string => !!id && id !== invoiceId)),
    ];
    return {
      parcelIds: parcels.map((p) => p.id),
      memberInvoiceIds: [invoiceId, ...memberInvoiceIds],
      groupId: invoice.parcelGroupId,
    };
  }

  const parcels = await prisma.parcel.findMany({
    where: { invoiceId },
    select: { id: true },
  });
  return { parcelIds: parcels.map((p) => p.id), memberInvoiceIds: [invoiceId], groupId: null };
}

/**
 * Calcule la part de frais de magasinage par colis. Reproduit la logique de
 * ComputeStorageFeeUseCase sans passer par le container DI (cette route est
 * handler-based, pas use-case). Retourne un objet par parcelId.
 */
async function computeStorageFeesForParcels(parcelIds: string[]): Promise<{
  perParcel: Map<string, { fee: number; days: number }>;
  total: number;
}> {
  if (parcelIds.length === 0) return { perParcel: new Map(), total: 0 };
  const parcels = await prisma.parcel.findMany({
    where: { id: { in: parcelIds } },
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
        parcelGroup: { select: { id: true, reference: true, label: true } },
      },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Facture introuvable' });

    // Resout colis effectifs (facture standard ou facture agregat de groupe)
    // + factures membres pour aggreger les paiements.
    const scope = await resolveInvoiceScope(invoice.id);
    const [parcelDetails, paymentList, storage, discountAudit] = await Promise.all([
      prisma.parcel.findMany({
        where: { id: { in: scope.parcelIds } },
        select: {
          id: true, trackingNumber: true, designation: true, weight: true, volume: true,
          destination: true, price: true, invoiceId: true,
        },
      }),
      prisma.payment.findMany({
        where: { invoiceId: { in: scope.memberInvoiceIds }, isVoided: false },
        orderBy: { createdAt: 'asc' },
        include: {
          agency: { select: { name: true } },
          receivedBy: { select: { firstName: true, lastName: true } },
          invoice: { select: { id: true, reference: true } },
        },
      }),
      computeStorageFeesForParcels(scope.parcelIds),
      prisma.auditLog.findMany({
        where: {
          entityType: 'Invoice',
          entityId: { in: scope.memberInvoiceIds },
          action: { in: ['DISCOUNT_APPLIED', 'DISCOUNT_REMOVED'] },
        },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    const enriched = {
      ...invoice,
      parcels: parcelDetails.map((p) => ({
        ...p,
        storageFee: storage.perParcel.get(p.id)?.fee ?? 0,
        storageDays: storage.perParcel.get(p.id)?.days ?? 0,
      })),
      payments: paymentList,
      storageFeesTotal: storage.total,
      isAggregate: scope.groupId != null,
      groupId: scope.groupId,
      discountHistory: discountAudit,
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
      },
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Facture introuvable' });
    }

    // Calcul des frais de magasinage par colis a l'instant T. On les rend
    // visibles sur la facture pour transparence.
    const scope = await resolveInvoiceScope(invoice.id);
    const [parcelDetails, paymentList, storage] = await Promise.all([
      prisma.parcel.findMany({
        where: { id: { in: scope.parcelIds } },
        select: {
          id: true, trackingNumber: true, designation: true, weight: true, volume: true,
          destination: true, price: true,
        },
      }),
      prisma.payment.findMany({
        where: { invoiceId: { in: scope.memberInvoiceIds }, isVoided: false },
        orderBy: { createdAt: 'asc' },
        include: { agency: { select: { name: true } } },
      }),
      computeStorageFeesForParcels(scope.parcelIds),
    ]);

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
      parcel: parcelDetails.map((p: any) => {
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
      payments: paymentList.map((p: any) => ({
        createdAt: p.createdAt,
        method: p.paymentMethod ?? p.method ?? '-',
        amount: Number(p.amount),
        agency: p.agency,
      })),
      totalAmount: Number((invoice as any).totalAmount ?? 0),
      discount: Number((invoice as any).discount ?? 0),
      tax: Number((invoice as any).tva ?? 0),
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
      },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Facture introuvable' });

    const scope = await resolveInvoiceScope(invoice.id);
    const [parcelDetails, storage] = await Promise.all([
      prisma.parcel.findMany({
        where: { id: { in: scope.parcelIds } },
        select: {
          id: true, trackingNumber: true, designation: true, weight: true, volume: true,
          destination: true, price: true,
        },
      }),
      computeStorageFeesForParcels(scope.parcelIds),
    ]);
    const excel = new ExcelService();
    const parcelRows = parcelDetails.map((p: any, i: number) => {
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

/**
 * Applique (ou remplace) une remise sur la facture avec justification obligatoire.
 * Recalcule netAmount + balance et trace l'operation via AuditLog (action
 * DISCOUNT_APPLIED) avec l'ancien/nouveau montant + raison + userId.
 * Body : { amount: number >= 0, reason: string (min 3 chars) }
 */
router.post('/:id/discount', validate(applyInvoiceDiscountSchema), async (req, res, next) => {
  try {
    const { amount, reason } = req.body as ApplyInvoiceDiscountInput;

    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ success: false, message: 'Facture introuvable' });

    // Garde-fou : la remise ne peut pas excéder le brut.
    const total = Number(invoice.totalAmount);
    if (amount > total) {
      return res.status(400).json({
        success: false,
        message: `Remise (${amount}) superieure au brut (${total}).`,
      });
    }

    const previousDiscount = Number(invoice.discount);
    const tva = Number(invoice.tva);
    const newNet = Math.max(0, total - amount + tva);
    const paid = Number(invoice.paidAmount);
    const newBalance = Math.max(0, newNet - paid);
    const newStatus = newBalance <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';

    const updated = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.update({
        where: { id: invoice.id },
        data: { discount: amount, netAmount: newNet, balance: newBalance, status: newStatus as any },
      });
      await tx.auditLog.create({
        data: {
          userId: req.user?.userId ?? null,
          agencyId: invoice.agencyId,
          action: amount > 0 ? 'DISCOUNT_APPLIED' : 'DISCOUNT_REMOVED',
          entityType: 'Invoice',
          entityId: invoice.id,
          changes: {
            previousDiscount,
            newDiscount: amount,
            reason,
            totalAmount: total,
            newNetAmount: newNet,
            newBalance,
          },
        },
      });
      return inv;
    });

    // Si facture membre d'un groupe : on resync l'agregat (somme members).
    if (!invoice.parcelGroupId) {
      const parcel = await prisma.parcel.findFirst({
        where: { invoiceId: invoice.id, parcelGroupId: { not: null } },
        select: { parcelGroupId: true },
      });
      if (parcel?.parcelGroupId) {
        const { GroupInvoiceService } = await import('../../../application/services/GroupInvoiceService');
        const svc = new GroupInvoiceService();
        await svc.sync(parcel.parcelGroupId);
      }
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
