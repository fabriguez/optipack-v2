import { Router } from 'express';
import multer from 'multer';
import {
  ClientPortalController,
  authenticateClient,
} from '../../controllers/ClientPortalController';
import { ClientPortalExtraController } from '../../controllers/ClientPortalExtraController';
import { ClientPortalKycController } from '../../controllers/ClientPortalKycController';

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

// Authenticated routes
router.get('/me', authenticateClient, ClientPortalController.me);
router.patch('/me', authenticateClient, ClientPortalKycController.updateProfile);
router.post('/me/upload', authenticateClient, kycUpload, ClientPortalKycController.uploadDocument);

// PDF downloads (client portal): proxy vers PDFService avec verif appartenance.
router.get('/parcels/:tracking/label', authenticateClient, async (req, res, next) => {
  try {
    const { prisma: prismaModule } = await import('../../../config/database');
    const { QRCodeService } = await import('../../../application/services/QRCodeService');
    const { PDFService } = await import('../../../application/services/PDFService');
    const { clientId } = req.clientPortal!;
    const parcel = await prismaModule.parcel.findUnique({
      where: { trackingNumber: req.params.tracking },
      include: {
        client: { select: { id: true, fullName: true, phone: true } },
        recipient: { select: { fullName: true, phone: true } },
        warehouse: { select: { agency: { select: { name: true, city: true } } } },
        transitRoute: { select: { name: true, type: true } },
        parcelGroup: { select: { reference: true } },
      },
    });
    if (!parcel || parcel.clientId !== clientId || parcel.isDeleted) {
      return res.status(404).json({ success: false, message: 'Colis introuvable' });
    }
    const qr = await QRCodeService.generateParcelQR(parcel.trackingNumber, parcel.id);
    const pdf = await PDFService.generateLabelPDF(
      {
        trackingNumber: parcel.trackingNumber,
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
        isFragile: parcel.isFragile,
        isHazardous: parcel.isHazardous,
        groupIndex: null,
        groupSize: null,
        groupReference: parcel.parcelGroup?.reference ?? null,
      },
      qr,
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

router.get('/invoices/:id/pdf', authenticateClient, async (req, res, next) => {
  try {
    const { prisma: prismaModule } = await import('../../../config/database');
    const { PDFService } = await import('../../../application/services/PDFService');
    const { clientId } = req.clientPortal!;
    const invoice = await prismaModule.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        parcels: true,
        payments: true,
        agency: true,
      },
    });
    if (!invoice || invoice.clientId !== clientId) {
      return res.status(404).json({ success: false, message: 'Facture introuvable' });
    }
    const pdf = await PDFService.generateInvoicePDF(invoice as any);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="facture-${invoice.reference}.pdf"`,
      'Content-Length': pdf.length.toString(),
    });
    res.send(pdf);
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
