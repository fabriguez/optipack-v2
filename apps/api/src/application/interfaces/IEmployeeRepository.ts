import type { Employee, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';

export interface IEmployeeRepository {
  findById(id: string): Promise<Employee | null>;
  findByAgency(agencyId: string, pagination: PaginationInput): Promise<PaginatedResponse<Employee>>;
  create(data: Prisma.EmployeeCreateInput): Promise<Employee>;
  update(id: string, data: Prisma.EmployeeUpdateInput): Promise<Employee>;
  delete(id: string): Promise<void>;
}

export const EMPLOYEE_REPOSITORY = Symbol.for('IEmployeeRepository');
