import { Router } from 'express';
import multer from 'multer';
import {
  ClientPortalController,
  authenticateClient,
} from '../../controllers/ClientPortalController';
import { ClientPortalExtraController } from '../../controllers/ClientPortalExtraController';
import { ClientPortalKycController } from '../../controllers/ClientPortalKycController';
import { StreamChatController } from '../../controllers/StreamChatController';
import { forgotPasswordLimiter, resetPasswordLimiter } from '../../middleware/rateLimit';

const router = Router();

// Multer en memoire pour upload KYC (image jusqu'a 5 MB, champ `file`).
const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(new Error('Type non supporte. JPG, PNG ou WEBP requis.'));
      return;
    }
    cb(null, true);
  },
}).single('file');

// Public routes
router.post('/login', ClientPortalController.login);
router.post('/register', ClientPortalController.register);
router.post('/forgot-password', forgotPasswordLimiter, ClientPortalController.forgotPassword);
// Etape intermediaire : valide le code OTP sans le consommer (reset en deux temps).
router.post('/verify-reset-code', resetPasswordLimiter, ClientPortalController.verifyResetCode);
router.post('/reset-password', resetPasswordLimiter, ClientPortalController.resetPassword);

// Authenticated routes
router.get('/me', authenticateClient, ClientPortalController.me);
router.get('/my-tariffs', authenticateClient, ClientPortalController.myTariffs);
router.patch('/me', authenticateClient, ClientPortalKycController.updateProfile);
router.post('/me/upload', authenticateClient, kycUpload, ClientPortalKycController.uploadDocument);
router.post('/me/password', authenticateClient, ClientPortalController.changePassword);

// Stream Chat : token client + channel support temps reel.
router.post('/support/token', authenticateClient, StreamChatController.clientToken);

// Preferences notification du client (memes semantiques que User.notificationPrefs :
// map { [eventKind]: { channels: [...] } }). Lecture/ecriture du compte connecte.
router.get('/me/notification-prefs', authenticateClient, async (req, res, next) => {
  try {
    const { prisma } = await import('../../../config/database');
    const { clientId } = req.clientPortal!;
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { notificationPrefs: true },
    });
    res.json({ success: true, data: client?.notificationPrefs ?? {} });
  } catch (err) {
    next(err);
  }
});

router.put('/me/notification-prefs', authenticateClient, async (req, res, next) => {
  try {
    const body = req.body;
    if (body == null || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ success: false, message: 'Format invalide' });
    }
    const { prisma } = await import('../../../config/database');
    const { clientId } = req.clientPortal!;
    await prisma.client.update({
      where: { id: clientId },
      data: { notificationPrefs: body },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PDF downloads (client portal): proxy vers PDFService avec verif appartenance.
router.get('/parcels/:tracking/label', authenticateClient, async (req, res, next) => {
  try {
    const { prisma: prismaModule } = await import('../../../config/database');
    const { QRCodeService } = await import('../../../application/services/QRCodeService');
    const { PDFService } = await import('../../../application/services/PDFService');
    const { loadPdfBranding } = await import('../../../application/services/PdfBrandingService');
    const { clientId } = req.clientPortal!;
    const parcel = await prismaModule.parcel.findUnique({
      where: { trackingNumber: req.params.tracking },
      include: {
        client: { select: { id: true, fullName: true, phone: true } },
        recipient: { select: { fullName: true, phone: true } },
        warehouse: { select: { agency: { select: { name: true, city: true } } } },
        transitRoute: { select: { name: true, type: true } },
        parcelGroup: { select: { reference: true } },
        invoice: { select: { netAmount: true, balance: true } },
      },
    });
    if (!parcel || parcel.clientId !== clientId || parcel.isDeleted) {
      return res.status(404).json({ success: false, message: 'Colis introuvable' });
    }
    const qr = await QRCodeService.generateParcelQR(parcel.trackingNumber, parcel.id);
    const pdf = await PDFService.generateLabelPDF(
      {
        trackingNumber: parcel.trackingNumber,
        trackingFournisseur: parcel.trackingFournisseur ?? null,
        designation: parcel.designation,
        weight: parcel.weight ? Number(parcel.weight) : null,
        volume: parcel.volume ? Number(parcel.volume) : null,
        destination: parcel.destination,
        origin: parcel.origin ?? null,
        clientName: parcel.client?.fullName ?? '-',
        clientPhone: parcel.client?.phone ?? null,
        recipientName: parcel.recipient?.fullName ?? null,
        recipientPhone: parcel.recipient?.phone ?? null,
        transitRoute: parcel.transitRoute?.name ?? null,
        transitType: parcel.transitRoute?.type ?? null,
        agencyName: parcel.warehouse?.agency
          ? `${parcel.warehouse.agency.name} (${parcel.warehouse.agency.city})`
          : null,
        observation: parcel.observation ?? null,
        price: parcel.price ? Number(parcel.price) : null,
        invoiceTotal: parcel.invoice?.netAmount != null ? Number(parcel.invoice.netAmount) : null,
        invoiceBalance: parcel.invoice?.balance != null ? Number(parcel.invoice.balance) : null,
        isFragile: parcel.isFragile,
        isHazardous: parcel.isHazardous,
        groupIndex: null,
        groupSize: null,
        groupReference: parcel.parcelGroup?.reference ?? null,
      },
      qr,
      await loadPdfBranding((parcel as { organizationId?: string }).organizationId),
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ticket-${parcel.trackingNumber}.pdf"`,
      'Content-Length': pdf.length.toString(),
    });
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

// Detail facture pour le portail client (lecture seule, ownership verifiee).
router.get('/invoices/:id', authenticateClient, async (req, res, next) => {
  try {
    const { prisma: prismaModule } = await import('../../../config/database');
    const { clientId } = req.clientPortal!;
    const invoice = await prismaModule.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        agency: { select: { id: true, name: true, city: true, country: true, phone: true } },
        parcels: {
          select: {
            id: true,
            trackingNumber: true,
            designation: true,
            price: true,
            status: true,
          },
        },
        payments: {
          where: { isVoided: false },
          select: {
            id: true,
            reference: true,
            amount: true,
            discount: true,
            discountReason: true,
            paymentMethod: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!invoice || invoice.clientId !== clientId) {
      return res.status(404).json({ success: false, message: 'Facture introuvable' });
    }

    // Detail des frais : transport (prix colis) vs magasinage (live).
    // Permet au client de voir la repartition + les avances + le reste a payer.
    const { computeStorageFeesForParcels } = await import('./invoice.routes');
    const parcelIds = invoice.parcels.map((p) => p.id);
    const storage = await computeStorageFeesForParcels(parcelIds);

    const transportFeesTotal = invoice.parcels.reduce(
      (sum, p) => sum + Number(p.price ?? 0),
      0,
    );
    const parcelLabelById = new Map(
      invoice.parcels.map((p) => [p.id, p.designation ?? p.trackingNumber]),
    );
    const parcelsWithFees = invoice.parcels.map((p) => {
      const s = storage.perParcel.get(p.id);
      return {
        ...p,
        transportFee: Number(p.price ?? 0),
        storageFee: s?.fee ?? 0,
        storageDays: s?.days ?? 0,
        storageWarehouseName: s?.warehouseName ?? null,
      };
    });

    // Section magasinage detaillee : une ligne par (colis / magasin / periode)
    // facturable. Permet d'expliquer le montant total des frais de stockage.
    const storageLines = invoice.parcels.flatMap((p) => {
      const s = storage.perParcel.get(p.id);
      return (s?.lines ?? [])
        .filter((l) => l.feeAmount > 0)
        .map((l) => ({
          ...l,
          parcelId: p.id,
          parcelLabel: parcelLabelById.get(p.id) ?? null,
        }));
    });

    // Section remises : remise globale facture + remises ponctuelles saisies
    // sur chaque paiement (Payment.discount + discountReason).
    const discounts: Array<{
      id: string;
      amount: number;
      reason: string | null;
      source: 'INVOICE' | 'PAYMENT';
      date: Date | null;
    }> = [];
    if (Number(invoice.discount ?? 0) > 0) {
      discounts.push({
        id: `invoice-${invoice.id}`,
        amount: Number(invoice.discount),
        reason: 'Remise sur facture',
        source: 'INVOICE',
        date: invoice.createdAt ?? null,
      });
    }
    for (const pay of invoice.payments) {
      if (Number(pay.discount ?? 0) > 0) {
        discounts.push({
          id: `payment-${pay.id}`,
          amount: Number(pay.discount),
          reason: pay.discountReason ?? 'Remise au paiement',
          source: 'PAYMENT',
          date: pay.createdAt,
        });
      }
    }

    res.json({
      success: true,
      data: {
        ...invoice,
        parcels: parcelsWithFees,
        storageLines,
        discounts,
        // Recapitulatif des frais et reglements pour la gestion des paiements.
        fees: {
          transport: transportFeesTotal,
          storage: storage.total,
          discount: Number(invoice.discount ?? 0),
          tax: Number(invoice.tva ?? 0),
          net: Number(invoice.netAmount ?? 0),
          advances: Number(invoice.paidAmount ?? 0),
          remaining: Number(invoice.balance ?? 0),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/invoices/:id/pdf', authenticateClient, async (req, res, next) => {
  try {
    const { buildInvoicePdfBuffer } = await import('./invoice.routes');
    const { clientId } = req.clientPortal!;
    const out = await buildInvoicePdfBuffer(req.params.id);
    if (!out) return res.status(404).json({ success: false, message: 'Facture introuvable' });
    if (out.clientId !== clientId) {
      return res.status(403).json({ success: false, message: 'Acces refuse' });
    }
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

// Recu de paiement (justificatif PDF). Verifie la propriete via le clientId
// de la facture liee au paiement.
router.get('/payments/:id/pdf', authenticateClient, async (req, res, next) => {
  try {
    const { buildPaymentReceiptPdfBuffer } = await import('./invoice.routes');
    const { clientId } = req.clientPortal!;
    const out = await buildPaymentReceiptPdfBuffer(req.params.id);
    if (!out) return res.status(404).json({ success: false, message: 'Recu introuvable' });
    if (out.clientId !== clientId) {
      return res.status(403).json({ success: false, message: 'Acces refuse' });
    }
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="recu-${out.reference}.pdf"`,
      'Content-Length': out.pdf.length.toString(),
    });
    res.send(out.pdf);
  } catch (err) {
    next(err);
  }
});

// Dashboard
router.get(
  '/dashboard',
  authenticateClient,
  ClientPortalExtraController.dashboard,
);

// Parcels
router.get('/parcels', authenticateClient, ClientPortalController.parcels);
router.get(
  '/parcels/:trackingNumber',
  authenticateClient,
  ClientPortalExtraController.parcelDetail,
);

// Finance
router.get('/invoices', authenticateClient, ClientPortalController.invoices);
router.get('/payments', authenticateClient, ClientPortalController.payments);
router.post(
  '/payments/declare',
  authenticateClient,
  ClientPortalExtraController.declarePayment,
);
router.get('/debts', authenticateClient, ClientPortalController.debts);

// Notifications
router.get(
  '/notifications',
  authenticateClient,
  ClientPortalController.notifications,
);
router.post(
  '/notifications/read-all',
  authenticateClient,
  ClientPortalExtraController.markAllNotificationsRead,
);
router.post(
  '/notifications/:id/read',
  authenticateClient,
  ClientPortalExtraController.markNotificationRead,
);

// Push : enregistrement / desenregistrement du token Expo de l'appareil.
// Idempotent : on dedoublonne cote tableau. Le desenregistrement sert au
// logout pour ne plus recevoir de push sur cet appareil.
router.post('/push-token', authenticateClient, async (req, res, next) => {
  try {
    const { prisma } = await import('../../../config/database');
    const { clientId } = req.clientPortal!;
    const token = (req.body?.token as string | undefined)?.trim();
    if (!token) {
      return res.status(400).json({ success: false, message: 'token requis' });
    }
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { pushTokens: true },
    });
    const tokens = new Set(client?.pushTokens ?? []);
    tokens.add(token);
    await prisma.client.update({
      where: { id: clientId },
      data: { pushTokens: Array.from(tokens) },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/push-token', authenticateClient, async (req, res, next) => {
  try {
    const { prisma } = await import('../../../config/database');
    const { clientId } = req.clientPortal!;
    const token = (req.body?.token as string | undefined)?.trim();
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { pushTokens: true },
    });
    const tokens = (client?.pushTokens ?? []).filter((t) => t !== token);
    await prisma.client.update({
      where: { id: clientId },
      data: { pushTokens: tokens },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Messagerie support
router.get(
  '/conversations',
  authenticateClient,
  ClientPortalExtraController.listConversations,
);
router.post(
  '/conversations',
  authenticateClient,
  ClientPortalExtraController.createConversation,
);
router.get(
  '/conversations/:id/messages',
  authenticateClient,
  ClientPortalExtraController.listMessages,
);
router.post(
  '/conversations/:id/messages',
  authenticateClient,
  ClientPortalExtraController.sendMessage,
);
router.post(
  '/conversations/:id/read',
  authenticateClient,
  ClientPortalExtraController.markConversationRead,
);

// Agences (lecture publique pour client connecte)
router.get('/agencies', authenticateClient, ClientPortalController.agencies);

export default router;
