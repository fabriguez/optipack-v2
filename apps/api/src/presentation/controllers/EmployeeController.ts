import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateEmployeeUseCase } from '../../application/use-cases/employee/CreateEmployeeUseCase';
import { UpdateEmployeeUseCase } from '../../application/use-cases/employee/UpdateEmployeeUseCase';
import { DeleteEmployeeUseCase } from '../../application/use-cases/employee/DeleteEmployeeUseCase';
import { UploadEmployeeImageUseCase } from '../../application/use-cases/employee/UploadEmployeeImageUseCase';
import { DeleteEmployeeImageUseCase } from '../../application/use-cases/employee/DeleteEmployeeImageUseCase';
import { GetEmployeeImageUseCase } from '../../application/use-cases/employee/GetEmployeeImageUseCase';
import { PayEmployeeFromCashRegisterUseCase } from '../../application/use-cases/employee/PayEmployeeFromCashRegisterUseCase';
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
import { EMPLOYEE_REPOSITORY } from '../../application/interfaces/IEmployeeRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';

export class EmployeeController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateEmployeeUseCase);
      const result = await useCase.execute(req.body);
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
