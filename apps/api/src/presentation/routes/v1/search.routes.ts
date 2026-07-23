import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { getPolicy } from '../../middleware/policyContext';
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

// Recherche globale : colis, clients, conteneurs, factures.
// ABAC : chaque section n'est interrogee QUE si l'utilisateur detient la
// permission de lecture correspondante (pas de 403 global — une section non
// autorisee renvoie simplement un tableau vide). Cf. PERMISSIONS-PLAN.md etape 1.
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (!q || q.length < 2) {
      return res.json({ success: true, data: { parcels: [], clients: [], containers: [], invoices: [] } });
    }

    // Scoping agence : merge en AND pour ne pas ecraser les OR de recherche.
    const ctx = scopeCtx(req);
    const policy = getPolicy(req);
    const can = (key: string) => !!policy?.can(key);

    const [parcels, clients, containers, invoices] = await Promise.all([
      can('parcel.read')
        ? prisma.parcel.findMany({
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
          })
        : Promise.resolve([]),
      can('client.read')
        ? prisma.client.findMany({
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
          })
        : Promise.resolve([]),
      can('container.read')
        ? prisma.container.findMany({
            where: andWhere(
              {
                isDeleted: false,
                designation: { contains: q, mode: 'insensitive' as const },
              },
              containerScope.where(ctx),
            ),
            take: 5,
            select: { id: true, designation: true, status: true, type: true },
          })
        : Promise.resolve([]),
      can('invoice.read')
        ? prisma.invoice.findMany({
            where: andWhere(
              { reference: { contains: q, mode: 'insensitive' as const } },
              invoiceScope.where(ctx),
            ),
            take: 5,
            select: { id: true, reference: true, status: true, netAmount: true },
          })
        : Promise.resolve([]),
    ]);

    // PII : le telephone client n'est visible qu'avec client.contact.read.
    const safeClients = can('client.contact.read')
      ? clients
      : clients.map((c) => ({ ...c, phone: null }));

    res.json({ success: true, data: { parcels, clients: safeClients, containers, invoices } });
  } catch (err) {
    next(err);
  }
});

export default router;
