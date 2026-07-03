import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema, applyInvoiceDiscountSchema, type ApplyInvoiceDiscountInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { PDFService } from '../../../application/services/PDFService';
import type { InvoiceData } from '../../../application/services/PDFService';
import { loadPdfBranding } from '../../../application/services/PdfBrandingService';
import { ExcelService } from '../../../infrastructure/excel/ExcelService';
import { container } from '../../../container';
import { StorageService } from '../../../infrastructure/storage/StorageService';
import { safeFetch } from '../../../infrastructure/http/safeFetch';
import { StorageChargeService } from '../../../application/services/StorageChargeService';
import { invoiceScope, scopeCtx } from '../../../application/services/scope/agencyScope';
import { applyFieldPolicy, INVOICE_FIELD_POLICY } from '../../serializers/fieldPolicy';
import { getPolicy } from '../../middleware/policyContext';
import sharp from 'sharp';

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
 * Detail d'une ligne de magasinage par colis (legacy compat). On expose
 * desormais aussi le tableau `lines` issu de ParcelStorageCharge pour le
 * detail multi-magasin / multi-phase.
 */
interface StorageFeeDetail {
  fee: number;
  days: number;
  freeDays: number;
  dailyRate: number;
  warehouseName: string | null;
  reason: string;
  /** Lignes detaillees : 1 par charge (magasin/phase/periode). */
  lines?: StorageChargeBreakdown[];
}

async function loadRawImage(url: string): Promise<Buffer | null> {
  if (!url) return null;
  // Cas 1 : URL servie par /uploads/object/<key>. La cle peut etre encodee
  // (encodeURIComponent par segment) -- on decode pour MinIO.
  if (url.includes('/uploads/object/')) {
    const rawKey = url.split('/uploads/object/').pop() ?? '';
    let key: string;
    try { key = decodeURIComponent(rawKey); } catch { key = rawKey; }
    try {
      const storage = container.resolve(StorageService);
      const obj = await storage.getObject(key);
      if (!obj) return null;
      const chunks: Buffer[] = [];
      for await (const ch of obj.stream as any) chunks.push(ch as Buffer);
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }
  // Cas 2 : URL absolue http(s) externe (legacy / preuve client). Fetch direct.
  if (/^https?:\/\//i.test(url)) {
    try {
      // safeFetch : bloque les URLs pointant vers des hotes internes (SSRF).
      const r = await safeFetch(url);
      if (!r.ok) return null;
      const ab = await r.arrayBuffer();
      return Buffer.from(ab);
    } catch {
      return null;
    }
  }
  // Cas 3 : cle MinIO brute (sans prefixe URL).
  try {
    const storage = container.resolve(StorageService);
    const obj = await storage.getObject(url);
    if (!obj) return null;
    const chunks: Buffer[] = [];
    for await (const ch of obj.stream as any) chunks.push(ch as Buffer);
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

/**
 * Charge une image et la convertit en JPEG : PDFKit ne supporte que JPEG/PNG
 * en natif (WebP, GIF, HEIC, AVIF echouent silencieusement). On normalise
 * tout en JPEG via sharp pour garantir le rendu.
 */
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  const raw = await loadRawImage(url);
  if (!raw) return null;
  try {
    return await sharp(raw, { failOn: 'none' })
      .rotate() // applique l'orientation EXIF
      .resize({ width: 400, height: 300, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (err) {
    // Fallback : si sharp echoue mais que c'est deja JPEG/PNG, on renvoie brut.
    if (raw.length >= 4) {
      const isJpeg = raw[0] === 0xff && raw[1] === 0xd8 && raw[2] === 0xff;
      const isPng = raw[0] === 0x89 && raw[1] === 0x50 && raw[2] === 0x4e && raw[3] === 0x47;
      if (isJpeg || isPng) return raw;
    }
    return null;
  }
}

export interface StorageChargeBreakdown {
  id: string;
  warehouseId: string;
  warehouseName: string | null;
  warehouseCity: string | null;
  phase: 'DEPARTURE' | 'TRANSIT' | 'DESTINATION';
  startedAt: Date;
  stoppedAt: Date | null;
  endedAt: Date;
  dailyRate: number;
  freeDays: number;
  chargedDays: number;
  feeAmount: number;
  ruleLabel: string | null;
  isActive: boolean;
  stopReason: string | null;
}

export async function computeStorageFeesForParcels(parcelIds: string[]): Promise<{
  perParcel: Map<string, StorageFeeDetail>;
  total: number;
}> {
  if (parcelIds.length === 0) return { perParcel: new Map(), total: 0 };

  // Nouvelle source de verite : ParcelStorageCharge (1 ligne par
  // magasin / phase / periode). On les agrege en facture detaillee.
  const chargeService = container.resolve(StorageChargeService);
  const agg = await chargeService.aggregateForParcels(parcelIds);
  if (agg.perParcel.size > 0) {
    const perParcel = new Map<string, StorageFeeDetail>();
    for (const [parcelId, bucket] of agg.perParcel.entries()) {
      const lines: StorageChargeBreakdown[] = bucket.lines.map((l) => ({
        id: l.id,
        warehouseId: l.warehouseId,
        warehouseName: l.warehouseName,
        warehouseCity: l.warehouseCity,
        phase: l.phase,
        startedAt: l.startedAt,
        stoppedAt: l.stoppedAt,
        endedAt: l.endedAt,
        dailyRate: l.dailyRate,
        freeDays: l.freeDays,
        chargedDays: l.chargedDays,
        feeAmount: l.feeAmount,
        ruleLabel: l.ruleLabel,
        isActive: l.isActive,
        stopReason: l.stopReason,
      }));
      const billable = lines.filter((l) => l.phase !== 'TRANSIT');
      const totalDays = billable.reduce((s, l) => s + l.chargedDays, 0);
      const last = billable[billable.length - 1];
      perParcel.set(parcelId, {
        fee: bucket.total,
        days: totalDays,
        freeDays: last?.freeDays ?? 0,
        dailyRate: last?.dailyRate ?? 0,
        warehouseName: last?.warehouseName ?? null,
        reason: billable.length === 0
          ? 'Aucune charge de magasinage facturable'
          : `${billable.length} periode(s) facturable(s) sur ${lines.length} magasin(s) traverses`,
        lines,
      });
    }
    // Remplit les colis sans charge enregistree (defaut zero ligne).
    for (const id of parcelIds) {
      if (!perParcel.has(id)) {
        perParcel.set(id, {
          fee: 0, days: 0, freeDays: 0, dailyRate: 0,
          warehouseName: null,
          reason: 'Aucune charge de magasinage enregistree',
          lines: [],
        });
      }
    }
    return { perParcel, total: agg.total };
  }

  // Fallback legacy : si aucune charge n'a encore ete enregistree (anciens
  // colis avant la mise en place de ParcelStorageCharge), on retombe sur
  // l'ancien calcul base sur warehouseEnteredAt + regle courante du magasin.
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
          name: true,
          storageFreeDays: true,
          storageDailyRate: true,
          storageFeeRules: true,
        },
      },
    },
  });
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const perParcel = new Map<string, StorageFeeDetail>();
  let total = 0;

  const inRange = (val: number | null, min: number | null, max: number | null) => {
    if (val == null) return min == null && max == null;
    if (min != null && val < min) return false;
    if (max != null && val > max) return false;
    return true;
  };

  for (const p of parcels) {
    if (!p.lastContainerId || !p.warehouse) {
      perParcel.set(p.id, {
        fee: 0,
        days: 0,
        freeDays: 0,
        dailyRate: 0,
        warehouseName: p.warehouse?.name ?? null,
        reason: !p.lastContainerId
          ? "Colis non issu d'un conteneur (pas de magasinage facturable)"
          : 'Colis sans magasin associe',
      });
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
    const ruleLabel = rule
      ? `Regle ${rule.transitType}${rule.transitRouteId ? ' (route specifique)' : ''}`
      : 'Tarif par defaut du magasin';
    const reason =
      fee === 0 && chargeable === 0
        ? `${days} jour(s) en magasin, dont ${freeDays} gratuit(s) -> 0 jour facturable`
        : `${days} jour(s) en magasin, ${freeDays} gratuit(s), ${chargeable} jour(s) factures a ${rate} FCFA/jour [${ruleLabel}]`;
    perParcel.set(p.id, {
      fee,
      days: chargeable,
      freeDays,
      dailyRate: rate,
      warehouseName: p.warehouse.name,
      reason,
    });
    total += fee;
  }
  return { perParcel, total };
}

const router = Router();

router.use(authenticate);

// Lecture des factures (liste)
router.get('/', validate(paginationSchema, 'query'), requirePermission('invoice.read'), async (req, res, next) => {
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
    // Scope agence : merge en AND pour ne pas ecraser le OR de recherche.
    const scopeWhere = invoiceScope.where(scopeCtx(req)) ?? null;
    const where: any = {
      isActive: true,
      ...(scopeWhere && { AND: [scopeWhere] }),
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

    const policy = getPolicy(req);
    const maskedData = policy ? applyFieldPolicy(data, INVOICE_FIELD_POLICY, policy) : data;
    res.json({
      success: true,
      data: maskedData,
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) { next(err); }
});

// Lecture du detail d'une facture
router.get('/:id', requirePermission('invoice.read'), async (req, res, next) => {
  try {
    await invoiceScope.assert(req.params.id, scopeCtx(req));
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
          destination: true, price: true, invoiceId: true, imageUrl: true, status: true,
          recipient: { select: { id: true, fullName: true, phone: true, email: true } },
          images: {
            select: { id: true, url: true, caption: true, isPrimary: true, sortOrder: true },
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            take: 4,
          },
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
        storageLines: storage.perParcel.get(p.id)?.lines ?? [],
      })),
      payments: paymentList,
      storageFeesTotal: storage.total,
      isAggregate: scope.groupId != null,
      groupId: scope.groupId,
      discountHistory: discountAudit,
    };
    const policy = getPolicy(req);
    res.json({ success: true, data: policy ? applyFieldPolicy(enriched, INVOICE_FIELD_POLICY, policy) : enriched });
  } catch (err) { next(err); }
});

// Generate invoice PDF
/**
 * Helper reutilisable : construit le PDF d'une facture a partir d'un id.
 * Retourne null si la facture est introuvable. Utilise par la route admin
 * `/invoices/:id/pdf` et par la route portail client `/client-portal/invoices/:id/pdf`.
 */
export async function buildInvoicePdfBuffer(
  invoiceId: string,
): Promise<{ pdf: Buffer; reference: string; clientId: string } | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      client: { select: { id: true, fullName: true, phone: true, email: true } },
      agency: { select: { id: true, name: true, code: true, address: true, phone: true, organizationId: true } },
    },
  });
  if (!invoice) return null;
  const pdf = await __buildPdfFromInvoice(invoice);
  return { pdf, reference: invoice.reference, clientId: invoice.clientId };
}

/**
 * Helper reutilisable : construit le PDF d'un recu de paiement a partir d'un
 * paymentId. Retourne null si le paiement est introuvable ou annule (void).
 * Utilise par la route portail client `/client-portal/payments/:id/pdf`.
 * Le `clientId` retourne permet a l'appelant de verifier la propriete.
 */
export async function buildPaymentReceiptPdfBuffer(
  paymentId: string,
): Promise<{ pdf: Buffer; reference: string; clientId: string } | null> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      invoice: {
        select: {
          reference: true,
          clientId: true,
          netAmount: true,
          paidAmount: true,
          balance: true,
          client: { select: { fullName: true, phone: true, email: true } },
        },
      },
      agency: { select: { name: true, code: true, address: true, phone: true, organizationId: true } },
      parcel: { select: { trackingNumber: true, designation: true } },
      receivedBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!payment || payment.isVoided || !payment.invoice) return null;

  const receivedByName = payment.receivedBy
    ? `${payment.receivedBy.firstName ?? ''} ${payment.receivedBy.lastName ?? ''}`.trim() || null
    : null;

  const pdf = await PDFService.generatePaymentReceiptPDF({
    reference: payment.reference,
    createdAt: payment.createdAt,
    amount: Number(payment.amount),
    method: payment.paymentMethod,
    transactionReference: payment.transactionReference,
    client: {
      fullName: payment.invoice.client.fullName,
      phone: payment.invoice.client.phone,
      email: payment.invoice.client.email,
    },
    agency: payment.agency
      ? { name: payment.agency.name, code: payment.agency.code, address: payment.agency.address, phone: payment.agency.phone }
      : null,
    invoice: {
      reference: payment.invoice.reference,
      netAmount: Number(payment.invoice.netAmount ?? 0),
      paidAmount: Number(payment.invoice.paidAmount ?? 0),
      balance: Number(payment.invoice.balance ?? 0),
    },
    parcel: payment.parcel
      ? { trackingNumber: payment.parcel.trackingNumber, designation: payment.parcel.designation }
      : null,
    receivedByName,
    // Payment n'a pas d'organizationId : le tenant se resout via l'agence
    // (agencyId obligatoire sur Payment). Sans ca, branding=null -> nom du
    // tenant absent de l'entete/pied du recu.
    branding: await loadPdfBranding(payment.agency?.organizationId),
  });

  return { pdf, reference: payment.reference, clientId: payment.invoice.clientId };
}

async function __buildPdfFromInvoice(invoice: any): Promise<Buffer> {

    // Calcul des frais de magasinage par colis a l'instant T. On les rend
    // visibles sur la facture pour transparence. discountAudit = historique
    // des remises (audit log) affiche en bas du PDF.
    const scope = await resolveInvoiceScope(invoice.id);
    const [parcelDetails, paymentList, storage, discountAudit] = await Promise.all([
      prisma.parcel.findMany({
        where: { id: { in: scope.parcelIds } },
        select: {
          id: true, trackingNumber: true, designation: true, weight: true, volume: true,
          destination: true, price: true, imageUrl: true, origin: true,
          transitRoute: { select: { name: true, type: true } },
          recipient: { select: { fullName: true, phone: true, email: true } },
          images: {
            select: { url: true, isPrimary: true, sortOrder: true },
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            take: 3,
          },
        },
      }),
      prisma.payment.findMany({
        where: { invoiceId: { in: scope.memberInvoiceIds }, isVoided: false },
        orderBy: { createdAt: 'asc' },
        include: { agency: { select: { name: true } } },
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
      parcel: await Promise.all(parcelDetails.map(async (p: any) => {
        const s = storage.perParcel.get(p.id);
        const imageUrls = [
          ...(p.imageUrl ? [p.imageUrl] : []),
          ...(p.images ?? []).map((i: any) => i.url),
        ].filter((u, i, arr) => u && arr.indexOf(u) === i).slice(0, 3);
        // Pre-fetch image bytes (MinIO) pour les embarquer dans le PDF.
        const imageBuffers = await Promise.all(
          imageUrls.map((url) => fetchImageBuffer(url).catch(() => null)),
        );
        return {
          trackingNumber: p.trackingNumber,
          designation: p.designation,
          weight: p.weight != null ? Number(p.weight) : null,
          volume: p.volume != null ? Number(p.volume) : null,
          destination: p.destination,
          price: Number(p.price),
          transitRouteName: p.transitRoute?.name ?? null,
          transitType: p.transitRoute?.type ?? null,
          origin: p.origin ?? null,
          recipientName: p.recipient?.fullName ?? null,
          recipientPhone: p.recipient?.phone ?? null,
          recipientEmail: p.recipient?.email ?? null,
          storageFee: s?.fee ?? 0,
          storageDays: s?.days ?? 0,
          storageFreeDays: s?.freeDays ?? 0,
          storageDailyRate: s?.dailyRate ?? 0,
          storageWarehouseName: s?.warehouseName ?? null,
          storageReason: s?.reason ?? null,
          storageLines: (s?.lines ?? []).map((l) => ({
            warehouseName: l.warehouseName,
            warehouseCity: l.warehouseCity,
            phase: l.phase,
            startedAt: l.startedAt,
            endedAt: l.endedAt,
            isActive: l.isActive,
            dailyRate: l.dailyRate,
            freeDays: l.freeDays,
            chargedDays: l.chargedDays,
            feeAmount: l.feeAmount,
            ruleLabel: l.ruleLabel,
            stopReason: l.stopReason,
          })),
          imageUrls,
          imageBuffers: imageBuffers.filter((b): b is Buffer => Buffer.isBuffer(b)),
        };
      })),
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
      discountHistory: discountAudit.map((e: any) => {
        const c = (e.changes ?? {}) as Record<string, unknown>;
        const userName = e.user
          ? `${(e.user.firstName ?? '').toString()} ${(e.user.lastName ?? '').toString()}`.trim() || null
          : null;
        return {
          createdAt: e.createdAt,
          action: e.action,
          previousDiscount: Number((c.previousDiscount as number | undefined) ?? 0),
          newDiscount: Number((c.newDiscount as number | undefined) ?? 0),
          reason: (c.reason as string | null | undefined) ?? null,
          userName,
        };
      }),
      // Invoice n'a pas d'organizationId : resolution via l'agence emettrice.
      branding: await loadPdfBranding(invoice.agency?.organizationId),
    };

    return PDFService.generateInvoicePDF(invoiceData);
}

// Export PDF de la facture
router.get('/:id/pdf', requirePermission('invoice.export'), async (req, res, next) => {
  try {
    await invoiceScope.assert(req.params.id, scopeCtx(req));
    const out = await buildInvoicePdfBuffer(req.params.id);
    if (!out) return res.status(404).json({ success: false, message: 'Facture introuvable' });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="facture-${out.reference}.pdf"`,
      'Content-Length': out.pdf.length.toString(),
    });
    res.send(out.pdf);
  } catch (err) {
    next(err);
  }
});

/**
 * Export XLSX d'une facture : une ligne par colis avec montant + frais
 * magasinage + part allouee de l'avance/solde. Utile pour la compta / export
 * comptable client.
 */
router.get('/:id/xlsx', requirePermission('invoice.export'), async (req, res, next) => {
  try {
    await invoiceScope.assert(req.params.id, scopeCtx(req));
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
router.post('/:id/discount', validate(applyInvoiceDiscountSchema), requirePermission('invoice.discount'), async (req, res, next) => {
  try {
    await invoiceScope.assert(req.params.id, scopeCtx(req));
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
