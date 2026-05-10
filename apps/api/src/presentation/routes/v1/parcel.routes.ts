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
      },
    });
    if (!parcel) {
      return res.status(404).json({ success: false, message: 'Colis introuvable' });
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

// Historique complet d'un colis
router.get('/:id/history', async (req, res, next) => {
  try {
    const history = await prisma.parcelHistory.findMany({
      where: { parcelId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
});

export default router;
