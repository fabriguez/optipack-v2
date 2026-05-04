import { inject, injectable } from 'tsyringe';
import { EMPLOYEE_REPOSITORY, type IEmployeeRepository } from '../../interfaces/IEmployeeRepository';
import { PayrollChargeService } from '../../services/PayrollChargeService';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class UpdateEmployeeUseCase {
  constructor(
    @inject(EMPLOYEE_REPOSITORY) private employeeRepo: IEmployeeRepository,
    private payrollCharge: PayrollChargeService,
  ) {}

  async execute(id: string, data: any) {
    const existing = await this.employeeRepo.findById(id);
    if (!existing) throw new NotFoundError('Employe', id);

    const employee = await this.employeeRepo.update(id, data);

    // Si le salaire ou l'etat actif change, on resync la masse salariale.
    const agencyChanged = data.agencyId && data.agencyId !== existing.agencyId;
    await this.payrollCharge.syncForAgency(employee.agencyId);
    if (agencyChanged) {
      await this.payrollCharge.syncForAgency(existing.agencyId);
    }
    return employee;
  }
}
