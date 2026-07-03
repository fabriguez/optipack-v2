import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { BusinessError, NotFoundError } from '../../domain/errors/BusinessError';
import { getOrgId } from '../middleware/tenantGuard';

type Scope = 'GLOBAL' | 'AGENCY' | 'EMPLOYEE';

export class HolidayController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = req.user!.organizationId;
      const { agencyId, employeeId, scope } = req.query as Record<string, string | undefined>;
      const items = await prisma.holiday.findMany({
        where: {
          organizationId: orgId,
          ...(scope ? { scope: scope as Scope } : {}),
          ...(agencyId ? { agencyId } : {}),
          ...(employeeId ? { employeeId } : {}),
        },
        orderBy: { fromDate: 'desc' },
        take: 500,
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = req.user!.organizationId;
      const {
        scope, agencyId, employeeId, name, fromDate, toDate, isRecurring, reason,
      } = req.body as {
        scope: Scope;
        agencyId?: string | null;
        employeeId?: string | null;
        name: string;
        fromDate: string;
        toDate: string;
        isRecurring?: boolean;
        reason?: string;
      };
      if (!name?.trim()) throw new BusinessError('Nom obligatoire');
      const from = new Date(fromDate); const to = new Date(toDate);
      if (isNaN(+from) || isNaN(+to)) throw new BusinessError('Dates invalides');
      if (from > to) throw new BusinessError('Date fin avant date debut');
      from.setUTCHours(0, 0, 0, 0); to.setUTCHours(0, 0, 0, 0);

      // Verrou coherence : scope ↔ ids
      if (scope === 'GLOBAL' && (agencyId || employeeId)) {
        throw new BusinessError('Scope GLOBAL incompatible avec agencyId/employeeId');
      }
      if (scope === 'AGENCY' && !agencyId) throw new BusinessError('agencyId requis pour scope AGENCY');
      if (scope === 'EMPLOYEE' && !employeeId) throw new BusinessError('employeeId requis pour scope EMPLOYEE');

      // Verifie que agencyId/employeeId fournis appartiennent bien au tenant courant
      if (agencyId) {
        const agency = await prisma.agency.findFirst({ where: { id: agencyId, organizationId: orgId } });
        if (!agency) throw new NotFoundError('Agence', agencyId);
      }
      if (employeeId) {
        const employee = await prisma.employee.findFirst({ where: { id: employeeId, agency: { organizationId: orgId } } });
        if (!employee) throw new NotFoundError('Employe', employeeId);
      }

      const item = await prisma.holiday.create({
        data: {
          organizationId: orgId,
          scope,
          agencyId: scope === 'AGENCY' ? agencyId! : null,
          employeeId: scope === 'EMPLOYEE' ? employeeId! : null,
          name: name.trim(),
          fromDate: from,
          toDate: to,
          isRecurring: !!isRecurring,
          reason: reason ?? null,
        },
      });
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { count } = await prisma.holiday.deleteMany({
        where: { id: req.params.id, organizationId: getOrgId(req) },
      });
      if (count === 0) throw new NotFoundError('Jour ferie', req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
}
