import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import {
  paginationSchema,
  createCarrierSchema,
  updateCarrierSchema,
} from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search } = req.query as any;
    const skip = (Number(page) - 1) * Number(limit);
    const organizationId = req.user!.organizationId;
    const where: any = {
      organizationId,
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    };
    const [data, total] = await Promise.all([
      prisma.carrier.findMany({ where, skip, take: Number(limit), orderBy: { name: 'asc' } }),
      prisma.carrier.count({ where }),
    ]);
    res.json({
      success: true,
      data,
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const c = await prisma.carrier.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ success: false, message: 'Transporteur introuvable' });
    res.json({ success: true, data: c });
  } catch (err) { next(err); }
});

router.post(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(createCarrierSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user!.organizationId;
      // Cree un Client associe au transporteur : permet d'imputer
      // depenses / paiements / dettes via la mecanique Client standard.
      // Si phone deja pris (cas re-creation), on suffix random pour
      // garantir l'unicite. organizationId pass via connect implicite
      // (Client.organization est M:N via Organization[]).
      const phone = req.body.phone || `CARRIER-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      const result = await prisma.$transaction(async (tx) => {
        const client = await tx.client.create({
          data: {
            organizationId,
            fullName: req.body.name,
            phone,
            email: req.body.email || null,
            address: req.body.address || null,
          },
        });
        const carrier = await tx.carrier.create({
          data: {
            organizationId,
            name: req.body.name,
            contactName: req.body.contactName || null,
            phone: req.body.phone || null,
            email: req.body.email || null,
            address: req.body.address || null,
            carrierType: req.body.carrierType || null,
            notes: req.body.notes || null,
            clientId: client.id,
          },
          include: { client: { select: { id: true, fullName: true, phone: true } } },
        });
        return carrier;
      });
      res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
  },
);

router.patch(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(updateCarrierSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await prisma.carrier.update({
        where: { id: req.params.id },
        data: { ...req.body, ...(req.body.email !== undefined && { email: req.body.email || null }) },
      });
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },
);

export default router;
