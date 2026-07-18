import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import {
  paginationSchema,
  createCarrierSchema,
  updateCarrierSchema,
} from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), requirePermission('carrier.read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search } = req.query as any;
    const skip = (Number(page) - 1) * Number(limit);
    const organizationId = req.user!.organizationId;
    // activeOnly=true : n'expose que les transporteurs actifs (ex. select de
    // creation conteneur, ou un transporteur desactive ne doit plus apparaitre).
    // Par defaut la liste admin renvoie tout (actifs + inactifs) avec badge.
    const activeOnly = (req.query as any).activeOnly === 'true' || (req.query as any).activeOnly === true;
    const where: any = {
      organizationId,
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
      ...(activeOnly && { isActive: true }),
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

router.get('/:id', requirePermission('carrier.read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const c = await prisma.carrier.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ success: false, message: 'Transporteur introuvable' });
    res.json({ success: true, data: c });
  } catch (err) { next(err); }
});

router.post(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('carrier.manage'),
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
            emergencyContactName: req.body.emergencyContactName?.trim() || null,
            emergencyContactPhone: req.body.emergencyContactPhone?.trim() || null,
            emergencyContactRelation: req.body.emergencyContactRelation?.trim() || null,
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
  requirePermission('carrier.manage'),
  validate(updateCarrierSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await prisma.carrier.update({
        where: { id: req.params.id },
        data: { ...req.body, ...(req.body.email !== undefined && { email: req.body.email || null }) },
        include: { client: { select: { id: true, fullName: true, phone: true } } },
      });
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },
);

router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('carrier.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Soft delete : on desactive plutot que supprimer pour preserver les
      // references historiques (containers, debts, paiements).
      const updated = await prisma.carrier.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },
);

export default router;
