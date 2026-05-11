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
      const created = await prisma.carrier.create({
        data: { organizationId, ...req.body, email: req.body.email || null },
      });
      res.status(201).json({ success: true, data: created });
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
