import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateEmployeeUseCase } from '../../application/use-cases/employee/CreateEmployeeUseCase';
import { UpdateEmployeeUseCase } from '../../application/use-cases/employee/UpdateEmployeeUseCase';
import { DeleteEmployeeUseCase } from '../../application/use-cases/employee/DeleteEmployeeUseCase';
import { UploadEmployeeImageUseCase } from '../../application/use-cases/employee/UploadEmployeeImageUseCase';
import { DeleteEmployeeImageUseCase } from '../../application/use-cases/employee/DeleteEmployeeImageUseCase';
import { GetEmployeeImageUseCase } from '../../application/use-cases/employee/GetEmployeeImageUseCase';
import { PayEmployeeFromCashRegisterUseCase } from '../../application/use-cases/employee/PayEmployeeFromCashRegisterUseCase';
import { ListEmployeesByPermissionUseCase } from '../../application/use-cases/employee/ListEmployeesByPermissionUseCase';
import {
  CreateSalaryDeductionUseCase,
  CancelSalaryDeductionUseCase,
  ListSalaryDeductionsUseCase,
} from '../../application/use-cases/employee/SalaryDeductionUseCases';
import {
  AddEmployeeDocumentUseCase,
  ListEmployeeDocumentsUseCase,
  DeleteEmployeeDocumentUseCase,
} from '../../application/use-cases/employee/EmployeeDocumentUseCases';
import { SetEmployeeManagerFlagUseCase } from '../../application/use-cases/employee/SetEmployeeManagerFlagUseCase';
import {
  SetEmployeeShiftsUseCase,
  GetEmployeeShiftsUseCase,
} from '../../application/use-cases/employee/EmployeeShiftUseCases';
import {
  MarkAttendanceUseCase,
  CheckOutAttendanceUseCase,
  ListEmployeeAttendanceUseCase,
  ListAgencyAttendanceForDateUseCase,
  EmployeeAttendanceStatsUseCase,
} from '../../application/use-cases/employee/AttendanceUseCases';
import {
  SubmitAttendanceJustificationUseCase,
  ReviewAttendanceJustificationUseCase,
  ListAttendanceJustificationsUseCase,
} from '../../application/use-cases/employee/AttendanceJustificationUseCases';
import {
  RequestEmployeeLeaveUseCase,
  ValidateEmployeeLeaveUseCase,
  ListEmployeeLeavesUseCase,
  ListAgencyPendingLeavesUseCase,
  CancelEmployeeLeaveUseCase,
  EndEmployeeLeaveEarlyUseCase,
} from '../../application/use-cases/employee/EmployeeLeaveUseCases';
import {
  CreateEmployeeSanctionUseCase,
  ListEmployeeSanctionsUseCase,
  TerminateEmployeeContractUseCase,
} from '../../application/use-cases/employee/EmployeeSanctionUseCases';
import {
  CreateEmployeeReviewUseCase,
  ListEmployeeReviewsUseCase,
  GetAgencyReviewConfigUseCase,
  SetAgencyReviewConfigUseCase,
} from '../../application/use-cases/employee/EmployeeReviewUseCases';
import { AgencyHRStatsUseCase } from '../../application/use-cases/employee/AgencyHRStatsUseCase';
import { AgencyHRReportXlsxUseCase } from '../../application/use-cases/employee/AgencyHRReportXlsxUseCase';
import { EMPLOYEE_REPOSITORY } from '../../application/interfaces/IEmployeeRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';

function monthStart(): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export class EmployeeController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateEmployeeUseCase);
      const result = await useCase.execute(req.body, req.user?.organizationId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async listAll(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(EMPLOYEE_REPOSITORY);
      const { agencyId } = req.query;
      const result = await repo.findByAgencies(
        req.user!.agencyIds,
        req.query,
        agencyId as string | undefined,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /employees/by-permission?key=disbursement.order
   * Liste reduite (id, fullName, position, agency) des employes ayant
   * la permission ABAC demandee. Utilise par le form de decaissement pour
   * proposer l'ordonnateur, mais reutilisable pour tout autre form.
   */
  static async byPermission(req: Request, res: Response, next: NextFunction) {
    try {
      const key = (req.query.key as string | undefined) || '';
      if (!key) {
        res.status(400).json({ success: false, message: 'param "key" requis' });
        return;
      }
      const useCase = container.resolve(ListEmployeesByPermissionUseCase);
      const items = await useCase.execute(
        key,
        req.user!.agencyIds,
        req.user!.organizationId,
      );
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(EMPLOYEE_REPOSITORY);
      const result = await repo.findByAgency(req.params.agencyId, req.query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(EMPLOYEE_REPOSITORY);
      const employee = await repo.findById(req.params.id);
      if (!employee) throw new NotFoundError('Employe', req.params.id);
      res.json({ success: true, data: employee });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateEmployeeUseCase);
      const employee = await useCase.execute(req.params.id, req.body);
      res.json({ success: true, data: employee });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DeleteEmployeeUseCase);
      await useCase.execute(req.params.id);
      res.json({ success: true, message: 'Employe desactive' });
    } catch (err) {
      next(err);
    }
  }

  // ----- Photos employe (selfie / plan / document d'identite) -----

  static async uploadImage(req: Request, res: Response, next: NextFunction) {
    try {
      const slot = req.params.slot as 'selfie' | 'locationPlan' | 'idDocument' | 'idDocumentBack';
      if (!['selfie', 'locationPlan', 'idDocument', 'idDocumentBack'].includes(slot)) {
        throw new NotFoundError('Slot photo employe', slot);
      }
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
      }
      const useCase = container.resolve(UploadEmployeeImageUseCase);
      const result = await useCase.execute(req.params.id, slot, file);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async deleteImage(req: Request, res: Response, next: NextFunction) {
    try {
      const slot = req.params.slot as 'selfie' | 'locationPlan' | 'idDocument' | 'idDocumentBack';
      if (!['selfie', 'locationPlan', 'idDocument', 'idDocumentBack'].includes(slot)) {
        throw new NotFoundError('Slot photo employe', slot);
      }
      const useCase = container.resolve(DeleteEmployeeImageUseCase);
      const result = await useCase.execute(req.params.id, slot);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async pay(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(PayEmployeeFromCashRegisterUseCase);
      const result = await useCase.execute(req.params.id, req.body, req.user!.userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async listPayslips(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await (await import('../../config/database')).prisma.payslip.findMany({
        where: { employeeId: req.params.id },
        orderBy: { generatedAt: 'desc' },
        include: { paidExpense: { select: { id: true, cashRegisterId: true, createdAt: true } } },
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  // ----- Retenues sur salaire -----

  static async listDeductions(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListSalaryDeductionsUseCase);
      const items = await useCase.execute(req.params.id);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async createDeduction(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateSalaryDeductionUseCase);
      const item = await useCase.execute(
        { employeeId: req.params.id, ...req.body },
        req.user!.userId,
      );
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async cancelDeduction(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CancelSalaryDeductionUseCase);
      const item = await useCase.execute(
        req.params.deductionId,
        req.body?.reason,
        req.user!.userId,
      );
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  // ----- Documents (diplomes, contrats, ...) -----

  static async listDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListEmployeeDocumentsUseCase);
      const items = await useCase.execute(req.params.id);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async addDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(AddEmployeeDocumentUseCase);
      const doc = await useCase.execute(
        { employeeId: req.params.id, ...req.body },
        req.user!.userId,
      );
      res.status(201).json({ success: true, data: doc });
    } catch (err) {
      next(err);
    }
  }

  static async deleteDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DeleteEmployeeDocumentUseCase);
      const result = await useCase.execute(req.params.documentId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // ----- Promotion chef d'agence -----

  static async setManagerFlag(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(SetEmployeeManagerFlagUseCase);
      const isManager = !!req.body?.isAgencyManager;
      const item = await useCase.execute(req.params.id, isManager);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  // ----- Planning hebdo (shifts) -----

  static async getShifts(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetEmployeeShiftsUseCase);
      const items = await useCase.execute(req.params.id);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async setShifts(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(SetEmployeeShiftsUseCase);
      const items = await useCase.execute(req.params.id, Array.isArray(req.body?.shifts) ? req.body.shifts : []);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  // ----- Pointage (attendance) -----

  static async markAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(MarkAttendanceUseCase);
      const item = await useCase.execute(
        { employeeId: req.params.id, ...req.body },
        req.user!.userId,
      );
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async listAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListEmployeeAttendanceUseCase);
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      const items = await useCase.execute(req.params.id, from, to);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async listAgencyAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListAgencyAttendanceForDateUseCase);
      const date = req.query.date ? new Date(req.query.date as string) : new Date();
      const result = await useCase.execute(req.params.agencyId, date);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // ----- Conges -----

  static async requestLeave(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(RequestEmployeeLeaveUseCase);
      const item = await useCase.execute({ employeeId: req.params.id, ...req.body }, req.user!.userId);
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async listEmployeeLeaves(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListEmployeeLeavesUseCase);
      const items = await useCase.execute(req.params.id);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async listAgencyPendingLeaves(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListAgencyPendingLeavesUseCase);
      const items = await useCase.execute(req.params.agencyId);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async validateLeave(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ValidateEmployeeLeaveUseCase);
      const item = await useCase.execute(
        req.params.leaveId,
        req.body?.decision === 'REJECTED' ? 'REJECTED' : 'APPROVED',
        req.user!.userId,
        req.body?.comment,
      );
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async cancelLeave(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CancelEmployeeLeaveUseCase);
      const item = await useCase.execute(req.params.leaveId);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async endLeaveEarly(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(EndEmployeeLeaveEarlyUseCase);
      const item = await useCase.execute(
        req.params.leaveId,
        new Date(req.body.endDate),
        req.user!.userId,
        req.body?.reason,
      );
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  // ----- Pointage avance (check-out, justifications, stats) -----

  static async checkOut(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CheckOutAttendanceUseCase);
      const item = await useCase.execute(
        req.params.id,
        new Date(req.body.date),
        req.body.checkOutTime,
        req.user!.userId,
      );
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async submitJustification(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(SubmitAttendanceJustificationUseCase);
      const item = await useCase.execute(
        { attendanceId: req.params.attendanceId, ...req.body },
        req.user!.userId,
      );
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async reviewJustification(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ReviewAttendanceJustificationUseCase);
      const item = await useCase.execute(
        req.params.justificationId,
        req.body.decision,
        req.user!.userId,
        req.body?.comment,
      );
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async listAgencyJustifications(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListAttendanceJustificationsUseCase);
      const items = await useCase.execute(req.params.agencyId, req.query.status as any);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async attendanceStats(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(EmployeeAttendanceStatsUseCase);
      const from = req.query.from ? new Date(req.query.from as string) : monthStart();
      const to = req.query.to ? new Date(req.query.to as string) : new Date();
      const stats = await useCase.execute(req.params.id, from, to);
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }

  // ----- Sanctions -----

  static async createSanction(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateEmployeeSanctionUseCase);
      const item = await useCase.execute({ employeeId: req.params.id, ...req.body }, req.user!.userId);
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async listSanctions(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListEmployeeSanctionsUseCase);
      const items = await useCase.execute(req.params.id);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async terminateContract(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(TerminateEmployeeContractUseCase);
      const item = await useCase.execute({ employeeId: req.params.id, ...req.body }, req.user!.userId);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  // ----- Evaluations -----

  static async createReview(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateEmployeeReviewUseCase);
      const item = await useCase.execute({ employeeId: req.params.id, ...req.body }, req.user!.userId);
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async listReviews(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListEmployeeReviewsUseCase);
      const items = await useCase.execute(req.params.id);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async getAgencyReviewConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetAgencyReviewConfigUseCase);
      const item = await useCase.execute(req.params.agencyId);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  // ----- Stats RH + Rapport mensuel -----

  static async agencyHRStats(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(AgencyHRStatsUseCase);
      const stats = await useCase.execute({
        agencyId: req.params.agencyId,
        month: req.query.month as string | undefined,
      });
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }

  static async agencyHRReportXlsx(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(AgencyHRReportXlsxUseCase);
      const { buffer, fileName } = await useCase.execute({
        agencyId: req.params.agencyId,
        month: req.query.month as string | undefined,
      });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }

  static async setAgencyReviewConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(SetAgencyReviewConfigUseCase);
      const item = await useCase.execute(
        req.params.agencyId,
        Array.isArray(req.body?.criteria) ? req.body.criteria : [],
        req.body?.cadence ?? 'QUARTERLY',
      );
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async getImage(req: Request, res: Response, next: NextFunction) {
    try {
      const slot = req.params.slot as 'selfie' | 'locationPlan' | 'idDocument' | 'idDocumentBack';
      if (!['selfie', 'locationPlan', 'idDocument', 'idDocumentBack'].includes(slot)) {
        throw new NotFoundError('Slot photo employe', slot);
      }
      const useCase = container.resolve(GetEmployeeImageUseCase);
      const obj = await useCase.execute(req.params.id, slot);
      if (!obj) return res.status(404).end();
      res.setHeader('Content-Type', obj.contentType);
      res.setHeader('Content-Length', String(obj.size));
      res.setHeader('Cache-Control', 'public, max-age=86400');
      obj.stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }
}
