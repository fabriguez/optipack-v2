import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateEmployeeUseCase } from '../../application/use-cases/employee/CreateEmployeeUseCase';
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
      const repo = container.resolve<any>(EMPLOYEE_REPOSITORY);
      const employee = await repo.update(req.params.id, req.body);
      res.json({ success: true, data: employee });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(EMPLOYEE_REPOSITORY);
      await repo.delete(req.params.id);
      res.json({ success: true, message: 'Employe desactive' });
    } catch (err) {
      next(err);
    }
  }
}
