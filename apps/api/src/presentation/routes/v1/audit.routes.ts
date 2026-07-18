import { Router } from 'express';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { auditLogScope, scopeCtx } from '../../../application/services/scope/agencyScope';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN'));

router.get('/', requirePermission('audit.read'), validate(paginationSchema, 'query'), async (req, res, next) => {
  try {
    const { page = 1, limit = 30, search } = req.query as any;
    const skip = (Number(page) - 1) * Number(limit);
    const action = req.query.action as string | undefined;
    const entityType = req.query.entityType as string | undefined;
    const userId = req.query.userId as string | undefined;

    // Plage de dates (createdAt). Attend 'YYYY-MM-DD'. dateTo inclusif (fin de journee).
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const gte = dateFrom ? new Date(`${dateFrom}T00:00:00.000`) : undefined;
    const lte = dateTo ? new Date(`${dateTo}T23:59:59.999`) : undefined;
    const createdAtFilter = {
      ...(gte && !Number.isNaN(gte.getTime()) && { gte }),
      ...(lte && !Number.isNaN(lte.getTime()) && { lte }),
    };

    // Scope agence (etape 2) : merge en AND, sans toucher au OR de recherche.
    const scopeWhere = auditLogScope.where(scopeCtx(req));
    const where: any = {
      ...(action && { action }),
      ...(entityType && { entityType }),
      ...(userId && { userId }),
      ...(Object.keys(createdAtFilter).length > 0 && { createdAt: createdAtFilter }),
      ...(search && {
        OR: [
          { entityType: { contains: search, mode: 'insensitive' } },
          { action: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(scopeWhere && { AND: [scopeWhere] }),
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
