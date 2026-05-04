import { inject, injectable } from 'tsyringe';
import { EMPLOYEE_REPOSITORY, type IEmployeeRepository } from '../../interfaces/IEmployeeRepository';
import { PayrollChargeService } from '../../services/PayrollChargeService';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class DeleteEmployeeUseCase {
  constructor(
    @inject(EMPLOYEE_REPOSITORY) private employeeRepo: IEmployeeRepository,
    private payrollCharge: PayrollChargeService,
  ) {}

  async execute(id: string) {
    const existing = await this.employeeRepo.findById(id);
    if (!existing) throw new NotFoundError('Employe', id);
    await this.employeeRepo.delete(id);
    await this.payrollCharge.syncForAgency(existing.agencyId);
  }
}
