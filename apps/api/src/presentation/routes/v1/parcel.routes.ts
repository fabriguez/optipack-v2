import { Router } from 'express';
import { ParcelController } from '../../controllers/ParcelController';
import { authenticate } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { createParcelSchema, createBatchParcelsSchema, paginationSchema } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { QRCodeService } from '../../../application/services/QRCodeService';
import { PDFService } from '../../../application/services/PDFService';

const router = Router();

router.use(authenticate);

// QR code (rendu via AuthedImage cote front-end : fetch + blob URL)
router.get('/:id/qrcode', async (req, res, next) => {
  try {
    const parcel = await prisma.parcel.findUnique({
      where: { id: req.params.id },
      select: { id: true, trackingNumber: true },
    });
    if (!parcel) {
      return res.status(404).json({ success: false, message: 'Colis introuvable' });
    }

    const qrBuffer = await QRCodeService.generateParcelQR(parcel.trackingNumber, parcel.id);

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="qr-${parcel.trackingNumber}.png"`,
      'Content-Length': qrBuffer.length.toString(),
      'Cache-Control': 'private, max-age=3600',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(qrBuffer);
  } catch (err) {
    next(err);
  }
});

router.get('/', validate(paginationSchema, 'query'), ParcelController.list);
router.get('/tracking/:tracking', ParcelController.getByTracking);
router.get('/:id', ParcelController.getById);
router.post('/', validate(createParcelSchema), ParcelController.create);
router.post('/batch', validate(createBatchParcelsSchema), ParcelController.createBatch);
router.patch('/:id', ParcelController.update);
router.patch('/:id/status', ParcelController.updateStatus);

// Archivage en lot. Les colis archives disparaissent de tous les listings
// par defaut. Le filtre ?archived=true / ?archived=all ouvre l'acces.
router.post('/archive', ParcelController.archive);
router.post('/unarchive', ParcelController.unarchive);

// Galerie d'images
router.get('/:id/images', ParcelController.listImages);
router.post('/:id/images', ParcelController.addImage);
router.delete('/:id/images/:imageId', ParcelController.deleteImage);

// Frais de magasinage (calcul a la volee)
router.get('/:id/storage-fee', ParcelController.storageFee);

// Remise du colis au client (handover) avec confirmation d'identite par photo
router.post('/:id/handover', ParcelController.handover);
// Remise d'un colis trouve physiquement, non enregistre dans le systeme
router.post('/handover-untracked', ParcelController.handoverUntracked);

// Etiquette enrichie
router.get('/:id/label', async (req, res, next) => {
  try {
    const parcel = await prisma.parcel.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { fullName: true, phone: true } },
        recipient: { select: { fullName: true, phone: true } },
        warehouse: { include: { agency: { select: { name: true, city: true } } } },
        transitRoute: { select: { name: true, type: true } },
        parcelGroup: { select: { id: true, reference: true } },
      },
    });
    if (!parcel) {
      return res.status(404).json({ success: false, message: 'Colis introuvable' });
    }

    // Calcul X/N pour les colis appartenant a un groupe : on liste les colis
    // du groupe ordonnes par createdAt et on cherche l'index (1-based) du
    // colis courant. N = nombre total de colis du groupe (non supprimes).
    let groupIndex: number | null = null;
    let groupSize: number | null = null;
    if (parcel.parcelGroupId) {
      const siblings = await prisma.parcel.findMany({
        where: { parcelGroupId: parcel.parcelGroupId, isDeleted: false },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      groupSize = siblings.length;
      const idx = siblings.findIndex((s) => s.id === parcel.id);
      if (idx >= 0) groupIndex = idx + 1;
    }

    const qrBuffer = await QRCodeService.generateParcelQR(parcel.trackingNumber, parcel.id);
    const labelBuffer = await PDFService.generateLabelPDF(
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
        groupIndex,
        groupSize,
        groupReference: parcel.parcelGroup?.reference ?? null,
      },
      qrBuffer,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="label-${parcel.trackingNumber}.pdf"`,
      'Content-Length': labelBuffer.length.toString(),
    });
    res.send(labelBuffer);
  } catch (err) {
    next(err);
  }
});

// Historique complet d'un colis : evenements operationnels (ParcelHistory)
// + actions financieres (creation facture, paiements, annulations, debts).
// On fusionne tout dans une timeline triee desc par date pour que la page
// detail montre l'historique complet, op + finance, en un seul flux.
router.get('/:id/history', async (req, res, next) => {
  try {
    const parcelId = req.params.id;
    const [history, parcel] = await Promise.all([
      prisma.parcelHistory.findMany({
        where: { parcelId },
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.parcel.findUnique({
        where: { id: parcelId },
        select: { id: true, price: true, invoiceId: true, trackingNumber: true, designation: true },
      }),
    ]);

    // Evenements financiers derives. Forme volontairement compatible avec
    // les entrees ParcelHistory pour que l'UI utilise un seul renderer.
    const financialEvents: Array<{
      id: string;
      action: string;
      createdAt: Date;
      comment: string | null;
      user: { id: string; firstName: string | null; lastName: string | null } | null;
      metadata: Record<string, unknown>;
      financial: true;
    }> = [];

    if (parcel?.invoiceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: parcel.invoiceId },
        include: {
          payments: {
            orderBy: { createdAt: 'asc' },
            include: {
              receivedBy: { select: { id: true, firstName: true, lastName: true } },
              voidedBy: { select: { id: true, firstName: true, lastName: true } },
              agency: { select: { id: true, name: true } },
            },
          },
          debts: true,
        },
      });

      if (invoice) {
        // Creation de la facture
        financialEvents.push({
          id: `invoice-created-${invoice.id}`,
          action: 'INVOICE_GENERATED',
          createdAt: invoice.createdAt,
          comment: `Facture ${invoice.reference} generee (${Number(invoice.totalAmount).toLocaleString()} XAF)`,
          user: null,
          metadata: {
            invoiceId: invoice.id,
            reference: invoice.reference,
            totalAmount: Number(invoice.totalAmount),
            status: invoice.status,
          },
          financial: true,
        });

        for (const pay of invoice.payments) {
          financialEvents.push({
            id: `payment-${pay.id}`,
            action: pay.isVoided ? 'PAYMENT_VOIDED' : 'PAYMENT_RECORDED',
            createdAt: pay.createdAt,
            comment: pay.isVoided
              ? `Paiement ${pay.reference} annule (${pay.voidReason ?? 'sans motif'})`
              : `Paiement ${pay.reference} : ${Number(pay.amount).toLocaleString()} XAF (${pay.paymentMethod})`,
            user: pay.receivedBy,
            metadata: {
              paymentId: pay.id,
              reference: pay.reference,
              amount: Number(pay.amount),
              method: pay.paymentMethod,
              agency: pay.agency,
              isVoided: pay.isVoided,
              voidedAt: pay.voidedAt,
              voidReason: pay.voidReason,
              voidedBy: pay.voidedBy,
            },
            financial: true,
          });
        }

        for (const debt of invoice.debts) {
          financialEvents.push({
            id: `debt-${debt.id}`,
            action: 'DEBT_OPENED',
            createdAt: debt.createdAt,
            comment: `Dette ouverte : ${Number(debt.totalAmount).toLocaleString()} XAF${debt.nextDueDate ? ` (prochaine echeance ${new Date(debt.nextDueDate).toLocaleDateString()})` : ''}`,
            user: null,
            metadata: {
              debtId: debt.id,
              totalAmount: Number(debt.totalAmount),
              remainingAmount: Number(debt.remainingAmount),
              status: debt.status,
              nextDueDate: debt.nextDueDate,
            },
            financial: true,
          });
        }
      }
    }

    // Fusion + tri desc.
    const merged = [
      ...history.map((h) => ({ ...h, financial: false as const })),
      ...financialEvents,
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ success: true, data: merged });
  } catch (err) {
    next(err);
  }
});

export default router;
