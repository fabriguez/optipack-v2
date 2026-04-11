import { inject, injectable } from 'tsyringe';
import { EMPLOYEE_REPOSITORY, type IEmployeeRepository } from '../../interfaces/IEmployeeRepository';

interface CreateEmployeeInput {
  agencyId: string;
  fullName: string;
  idNumber?: string;
  phone?: string;
  position: string;
  level?: string;
  baseSalary?: number;
}

@injectable()
export class CreateEmployeeUseCase {
  constructor(
    @inject(EMPLOYEE_REPOSITORY) private employeeRepo: IEmployeeRepository,
  ) {}

  async execute(input: CreateEmployeeInput) {
    return this.employeeRepo.create({
      fullName: input.fullName,
      idNumber: input.idNumber ?? null,
      phone: input.phone ?? null,
      position: input.position,
      level: input.level ?? null,
      baseSalary: input.baseSalary ?? 0,
      agency: { connect: { id: input.agencyId } },
    });
  }
}
