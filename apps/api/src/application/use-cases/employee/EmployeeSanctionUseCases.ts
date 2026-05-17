import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { PayrollChargeService } from '../../services/PayrollChargeService';

type SanctionType = 'WARNING' | 'SUSPENSION' | 'PAY_FREEZE' | 'DEMOTION';
type TerminationType = 'RESIGNATION' | 'DISMISSAL' | 'END_OF_CONTRACT' | 'MUTUAL_AGREEMENT' | 'RETIREMENT' | 'OTHER';

interface SanctionInput {
  employeeId: string;
  type: SanctionType;
  reason: string;
  effectiveFrom: string | Date;
  effectiveTo?: string | Date;
  attachmentUrl?: string;
  attachmentKey?: string;
}

@injectable()
export class CreateEmployeeSanctionUseCase {
  async execute(input: SanctionInput, userId: string) {
    if (!input.reason?.trim()) throw new BusinessError('Le motif est obligatoire');
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new NotFoundError('Employe', input.employeeId);

    return prisma.employeeSanction.create({
      data: {
        employeeId: input.employeeId,
        type: input.type as any,
        reason: input.reason.trim(),
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        attachmentUrl: input.attachmentUrl ?? null,
        attachmentKey: input.attachmentKey ?? null,
        decidedByUserId: userId,
      },
    });
  }
}

@injectable()
export class ListEmployeeSanctionsUseCase {
  async execute(employeeId: string) {
    return prisma.employeeSanction.findMany({
      where: { employeeId },
      include: { decidedBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}

interface TerminationInput {
  employeeId: string;
  type: TerminationType;
  reason: string;
  effectiveDate: string | Date;
  attachmentUrl?: string;
  attachmentKey?: string;
}

@injectable()
export class TerminateEmployeeContractUseCase {
  constructor(private payrollCharge: PayrollChargeService) {}

  async execute(input: TerminationInput, userId: string) {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new NotFoundError('Employe', input.employeeId);
    if (!input.reason?.trim()) throw new BusinessError('Le motif est obligatoire');

    const date = new Date(input.effectiveDate);

    const result = await prisma.$transaction(async (tx) => {
      const term = await tx.contractTermination.upsert({
        where: { employeeId: input.employeeId },
        create: {
          employeeId: input.employeeId,
          type: input.type as any,
          reason: input.reason.trim(),
          effectiveDate: date,
          attachmentUrl: input.attachmentUrl ?? null,
          attachmentKey: input.attachmentKey ?? null,
          decidedByUserId: userId,
        },
        update: {
          type: input.type as any,
          reason: input.reason.trim(),
          effectiveDate: date,
          decidedByUserId: userId,
        },
      });

      // Desactive l'employe + set endDate. Si c'etait le chef d'agence, on
      // libere le flag (l'agence pourra promouvoir un autre chef).
      await tx.employee.update({
        where: { id: input.employeeId },
        data: { isActive: false, endDate: date, isAgencyManager: false },
      });

      return term;
    });

    // Resync masse salariale (l'employe inactif/endDate != null sort du calcul).
    await this.payrollCharge.syncForAgency(employee.agencyId);

    return result;
  }
}
