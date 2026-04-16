import { injectable } from 'tsyringe';
import type { Employee, Prisma } from '@prisma/client';
import type { IEmployeeRepository } from '../../../application/interfaces/IEmployeeRepository';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaEmployeeRepository implements IEmployeeRepository {
  async findById(id: string): Promise<Employee | null> {
    return prisma.employee.findUnique({
      where: { id },
      include: { agency: { select: { id: true, name: true, code: true } } },
    });
  }

  async findByAgency(
    agencyId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Employee>> {
    const { page, limit, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput = {
      agencyId,
      isActive: true,
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { position: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.employee.findMany({
        where, skip, take: limit,
        orderBy: { fullName: 'asc' },
        include: { agency: { select: { id: true, name: true } } },
      }),
      prisma.employee.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findByAgencies(
    agencyIds: string[],
    pagination: PaginationInput,
    agencyId?: string,
  ): Promise<PaginatedResponse<Employee>> {
    const { page, limit, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput = {
      agencyId: agencyId ? { equals: agencyId, in: agencyIds } : { in: agencyIds },
      isActive: true,
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { position: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.employee.findMany({
        where, skip, take: limit,
        orderBy: { fullName: 'asc' },
        include: { agency: { select: { id: true, name: true } } },
      }),
      prisma.employee.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async create(data: Prisma.EmployeeCreateInput): Promise<Employee> {
    return prisma.employee.create({ data });
  }

  async update(id: string, data: Prisma.EmployeeUpdateInput): Promise<Employee> {
    return prisma.employee.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await prisma.employee.update({ where: { id }, data: { isActive: false } });
  }
}
