import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@optipack/shared';
import { prisma } from '../../../config/database';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN'));

router.get('/', validate(paginationSchema, 'query'), async (req, res, next) => {
  try {
    const { page = 1, limit = 30, search } = req.query as any;
    const skip = (Number(page) - 1) * Number(limit);
    const action = req.query.action as string | undefined;
    const entityType = req.query.entityType as string | undefined;
    const userId = req.query.userId as string | undefined;

    const where: any = {
      ...(action && { action }),
      ...(entityType && { entityType }),
      ...(userId && { userId }),
      ...(search && {
        OR: [
          { entityType: { contains: search, mode: 'insensitive' } },
          { action: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where, skip, take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data,
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) { next(err); }
});

export default router;
