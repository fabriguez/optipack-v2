import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { HEAD_OFFICE_CASH_REGISTER_REPOSITORY, type IHeadOfficeCashRegisterRepository } from '../../application/interfaces/IHeadOfficeCashRegisterRepository';
import { CreateHeadOfficeDisbursementUseCase } from '../../application/use-cases/head-office/CreateHeadOfficeDisbursementUseCase';
import { VoidHeadOfficeDisbursementUseCase } from '../../application/use-cases/head-office/VoidHeadOfficeDisbursementUseCase';
import { PayEmployeeFromHeadOfficeUseCase } from '../../application/use-cases/head-office/PayEmployeeFromHeadOfficeUseCase';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../domain/errors/BusinessError';
import { getOrgId } from '../middleware/tenantGuard';

// Isolation tenant : l'organisation vient TOUJOURS du jeton authentifie, jamais
// du param d'URL / body / query (sinon IDOR cross-tenant sur les ressources siege).
const orgIdFrom = (req: Request) => (req.user as any)?.organizationId as string;

export class HeadOfficeController {
  // GET /head-office/:organizationId/cash-register
  static async getCashRegister(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<IHeadOfficeCashRegisterRepository>(HEAD_OFFICE_CASH_REGISTER_REPOSITORY);
      const organizationId = orgIdFrom(req);
      const register = await repo.findOrCreate(organizationId);
      res.json({ success: true, data: register });
    } catch (err) {
      next(err);
    }
  }

  // POST /head-office/disbursements
  static async createDisbursement(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateHeadOfficeDisbursementUseCase);
      const body = { ...req.body, organizationId: req.user!.organizationId };
      const result = await useCase.execute(body, req.user!.userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // GET /head-office/disbursements
  static async listDisbursements(req: Request, res: Response, next: NextFunction) {
    try {
      const q = req.query as Record<string, string | undefined>;
      const page = Number(q.page) || 1;
      const limit = Number(q.limit) || 20;
      const skip = (page - 1) * limit;
      const organizationId = req.user!.organizationId;

      const where: any = {
        organizationId,
        ...(q.ordererUserId && { ordererUserId: q.ordererUserId }),
        ...(q.containerId && { containerId: q.containerId }),
        ...(q.parcelId && { parcelId: q.parcelId }),
        ...(q.clientId && { clientId: q.clientId }),
        ...((q.dateFrom || q.dateTo) && {
          createdAt: {
            ...(q.dateFrom && { gte: new Date(q.dateFrom) }),
            ...(q.dateTo && { lte: new Date(q.dateTo) }),
          },
        }),
        ...((q.reference || q.search) && {
          reference: { contains: q.reference || q.search, mode: 'insensitive' },
        }),
      };

      const [data, total] = await Promise.all([
        prisma.headOfficeDisbursementVoucher.findMany({
          where, skip, take: limit, orderBy: { createdAt: 'desc' },
          include: {
            ordererUser: { select: { id: true, firstName: true, lastName: true } },
            issuedBy: { select: { id: true, firstName: true, lastName: true } },
            approvedBy: { select: { id: true, firstName: true, lastName: true } },
            container: { select: { id: true, designation: true } },
            parcel: { select: { id: true, trackingNumber: true } },
            client: { select: { id: true, fullName: true } },
          },
        }),
        prisma.headOfficeDisbursementVoucher.count({ where }),
      ]);

      res.json({
        success: true,
        data,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }

  // GET /head-office/disbursements/:id
  static async getDisbursement(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await prisma.headOfficeDisbursementVoucher.findFirst({
        where: { id: req.params.id, organizationId: getOrgId(req) },
        include: {
          ordererUser: { select: { id: true, firstName: true, lastName: true } },
          issuedBy: { select: { id: true, firstName: true, lastName: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true } },
          container: { select: { id: true, designation: true } },
          parcel: { select: { id: true, trackingNumber: true } },
          client: { select: { id: true, fullName: true } },
          organization: { select: { id: true, name: true } },
        },
      });
      if (!item) throw new NotFoundError('Bon de decaissement siege', req.params.id);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  // POST /head-office/disbursements/:id/void
  static async voidDisbursement(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(VoidHeadOfficeDisbursementUseCase);
      const reason = (req.body?.reason as string) || 'Annulation manuelle';
      const result = await useCase.execute(req.params.id, reason, req.user!.userId, getOrgId(req));
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // POST /head-office/employees/:employeeId/pay
  static async payEmployee(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(PayEmployeeFromHeadOfficeUseCase);
      const body = { ...req.body, organizationId: req.user!.organizationId };
      const result = await useCase.execute(req.params.employeeId, body, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
