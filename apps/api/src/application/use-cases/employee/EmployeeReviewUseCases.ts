import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

interface ReviewInput {
  employeeId: string;
  period: string;
  score?: number;
  summary?: string;
  criteria?: any;
}

@injectable()
export class CreateEmployeeReviewUseCase {
  async execute(input: ReviewInput, userId: string) {
    if (!input.period?.trim()) throw new BusinessError('Periode obligatoire');
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new NotFoundError('Employe', input.employeeId);
    return prisma.employeeReview.create({
      data: {
        employeeId: input.employeeId,
        period: input.period.trim(),
        score: input.score ?? null,
        summary: input.summary ?? null,
        criteria: input.criteria ?? null,
        reviewerUserId: userId,
      },
    });
  }
}

@injectable()
export class ListEmployeeReviewsUseCase {
  async execute(employeeId: string) {
    return prisma.employeeReview.findMany({
      where: { employeeId },
      include: { reviewer: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}

@injectable()
export class GetAgencyReviewConfigUseCase {
  async execute(agencyId: string) {
    return prisma.agencyReviewConfig.findUnique({ where: { agencyId } });
  }
}

@injectable()
export class SetAgencyReviewConfigUseCase {
  async execute(agencyId: string, criteria: any[], cadence: string) {
    return prisma.agencyReviewConfig.upsert({
      where: { agencyId },
      create: { agencyId, criteria, cadence },
      update: { criteria, cadence },
    });
  }
}
