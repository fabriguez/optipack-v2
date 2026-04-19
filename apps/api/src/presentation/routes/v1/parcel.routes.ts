import { Router } from 'express';
import { ParcelController } from '../../controllers/ParcelController';
import { authenticate } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { createParcelSchema, paginationSchema } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { QRCodeService } from '../../../application/services/QRCodeService';
import { PDFService } from '../../../application/services/PDFService';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), ParcelController.list);
router.get('/tracking/:tracking', ParcelController.getByTracking);
router.get('/:id', ParcelController.getById);
router.post('/', validate(createParcelSchema), ParcelController.create);
router.patch('/:id/status', ParcelController.updateStatus);

// QR code for a parcel
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
    });
    res.send(qrBuffer);
  } catch (err) {
    next(err);
  }
});

// Label PDF with QR + parcel info
router.get('/:id/label', async (req, res, next) => {
  try {
    const parcel = await prisma.parcel.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        trackingNumber: true,
        designation: true,
        weight: true,
        destination: true,
        client: { select: { fullName: true } },
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
        weight: Number(parcel.weight),
        destination: parcel.destination,
        clientName: (parcel as any).client?.fullName ?? '-',
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
