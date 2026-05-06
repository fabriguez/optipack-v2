import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { prisma } from '../../config/database';
import { NotFoundError, BusinessError } from '../../domain/errors/BusinessError';
import { RequestEmployeeLeaveUseCase } from '../../application/use-cases/employee/EmployeeLeaveUseCases';

/**
 * Endpoints "self" pour les utilisateurs avec un Employee lie (PERSONNEL / CHEF_AGENCE).
 * Permet a l'employe de consulter son profil, son pointage, ses bulletins et de
 * demander un conge. Le pointage reste prerogative du superviseur (chef agence).
 */
async function findMyEmployee(req: Request) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: {
      employee: {
        include: {
          agency: { select: { id: true, name: true, city: true } },
          manager: { select: { id: true, fullName: true, position: true } },
        },
      },
    },
  });
  if (!user?.employee) {
    throw new NotFoundError('Profil employe', req.user!.userId);
  }
  return user.employee;
}

export class MeController {
  static async getEmployee(req: Request, res: Response, next: NextFunction) {
    try {
      const employee = await findMyEmployee(req);
      res.json({ success: true, data: employee });
    } catch (err) {
      next(err);
    }
  }

  static async listMyAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const employee = await findMyEmployee(req);
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      const items = await prisma.attendance.findMany({
        where: {
          employeeId: employee.id,
          ...(from || to ? { date: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {}),
        },
        orderBy: { date: 'desc' },
        take: 200,
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async listMyLeaves(req: Request, res: Response, next: NextFunction) {
    try {
      const employee = await findMyEmployee(req);
      const items = await prisma.employeeLeave.findMany({
        where: { employeeId: employee.id },
        include: {
          validatedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async requestMyLeave(req: Request, res: Response, next: NextFunction) {
    try {
      const employee = await findMyEmployee(req);
      const useCase = container.resolve(RequestEmployeeLeaveUseCase);
      const item = await useCase.execute(
        { employeeId: employee.id, ...req.body },
        req.user!.userId,
      );
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async listMyPayslips(req: Request, res: Response, next: NextFunction) {
    try {
      const employee = await findMyEmployee(req);
      const items = await prisma.payslip.findMany({
        where: { employeeId: employee.id },
        orderBy: { generatedAt: 'desc' },
        take: 60,
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async listMyShifts(req: Request, res: Response, next: NextFunction) {
    try {
      const employee = await findMyEmployee(req);
      const items = await prisma.employeeShift.findMany({
        where: { employeeId: employee.id },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async listMyDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const employee = await findMyEmployee(req);
      const items = await prisma.employeeDocument.findMany({
        where: { employeeId: employee.id },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async listMySanctions(req: Request, res: Response, next: NextFunction) {
    try {
      const employee = await findMyEmployee(req);
      const items = await prisma.employeeSanction.findMany({
        where: { employeeId: employee.id },
        include: { decidedBy: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }
}

void BusinessError;
