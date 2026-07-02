import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

interface CreateInput {
  employeeId: string;
  amount: number;
  reason: string;
  period?: string;
}

@injectable()
export class CreateSalaryDeductionUseCase {
  async execute(input: CreateInput, userId: string) {
    if (input.amount <= 0) throw new BusinessError('Montant invalide');
    if (!input.reason?.trim()) throw new BusinessError('Le motif est obligatoire');
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new NotFoundError('Employe', input.employeeId);
    return prisma.salaryDeduction.create({
      data: {
        employeeId: input.employeeId,
        amount: input.amount,
        reason: input.reason.trim(),
        period: input.period ?? null,
        createdById: userId,
      },
    });
  }
}

@injectable()
export class CancelSalaryDeductionUseCase {
  async execute(deductionId: string, reason: string, _userId: string, organizationId: string) {
    const item = await prisma.salaryDeduction.findFirst({
      where: { id: deductionId, employee: { agency: { organizationId } } },
    });
    if (!item) throw new NotFoundError('Retenue', deductionId);
    if (item.status !== 'PENDING') {
      throw new BusinessError('Seules les retenues en attente peuvent etre annulees.');
    }
    return prisma.salaryDeduction.update({
      where: { id: deductionId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledReason: reason || 'Annulation manuelle',
      },
    });
  }
}

@injectable()
export class ListSalaryDeductionsUseCase {
  async execute(employeeId: string) {
    return prisma.salaryDeduction.findMany({
      where: { employeeId },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
