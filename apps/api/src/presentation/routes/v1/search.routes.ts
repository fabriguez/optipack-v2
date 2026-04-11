import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { prisma } from '../../../config/database';

const router = Router();

router.use(authenticate);

// Recherche globale : colis, clients, conteneurs, factures
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (!q || q.length < 2) {
      return res.json({ success: true, data: { parcels: [], clients: [], containers: [], invoices: [] } });
    }

    const [parcels, clients, containers, invoices] = await Promise.all([
      prisma.parcel.findMany({
        where: {
          isDeleted: false,
          OR: [
            { trackingNumber: { contains: q, mode: 'insensitive' } },
            { designation: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, trackingNumber: true, designation: true, status: true },
      }),
      prisma.client.findMany({
        where: {
          isActive: true,
          OR: [
            { fullName: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, fullName: true, phone: true, loyaltyTier: true },
      }),
      prisma.container.findMany({
        where: {
          isDeleted: false,
          designation: { contains: q, mode: 'insensitive' },
        },
        take: 5,
        select: { id: true, designation: true, status: true, type: true },
      }),
      prisma.invoice.findMany({
        where: {
          reference: { contains: q, mode: 'insensitive' },
        },
        take: 5,
        select: { id: true, reference: true, status: true, netAmount: true },
      }),
    ]);

    res.json({ success: true, data: { parcels, clients, containers, invoices } });
  } catch (err) {
    next(err);
  }
});

export default router;
