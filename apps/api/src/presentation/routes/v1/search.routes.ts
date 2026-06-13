// TODO ABAC : le filtrage des sections de resultats par permission arrive avec l'etape field-policy (au niveau controller).
import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { prisma } from '../../../config/database';
import {
  andWhere,
  clientScope,
  containerScope,
  invoiceScope,
  parcelScope,
  scopeCtx,
} from '../../../application/services/scope/agencyScope';

const router = Router();

router.use(authenticate);

// Recherche globale : colis, clients, conteneurs, factures
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (!q || q.length < 2) {
      return res.json({ success: true, data: { parcels: [], clients: [], containers: [], invoices: [] } });
    }

    // Scoping agence : merge en AND pour ne pas ecraser les OR de recherche.
    const ctx = scopeCtx(req);

    const [parcels, clients, containers, invoices] = await Promise.all([
      prisma.parcel.findMany({
        where: andWhere(
          {
            isDeleted: false,
            OR: [
              { trackingNumber: { contains: q, mode: 'insensitive' as const } },
              { designation: { contains: q, mode: 'insensitive' as const } },
            ],
          },
          parcelScope.where(ctx),
        ),
        take: 5,
        select: { id: true, trackingNumber: true, designation: true, status: true },
      }),
      prisma.client.findMany({
        where: andWhere(
          {
            isActive: true,
            OR: [
              { fullName: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q } },
              { email: { contains: q, mode: 'insensitive' as const } },
            ],
          },
          clientScope.where(ctx),
        ),
        take: 5,
        select: { id: true, fullName: true, phone: true, loyaltyTier: true },
      }),
      prisma.container.findMany({
        where: andWhere(
          {
            isDeleted: false,
            designation: { contains: q, mode: 'insensitive' as const },
          },
          containerScope.where(ctx),
        ),
        take: 5,
        select: { id: true, designation: true, status: true, type: true },
      }),
      prisma.invoice.findMany({
        where: andWhere(
          { reference: { contains: q, mode: 'insensitive' as const } },
          invoiceScope.where(ctx),
        ),
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
