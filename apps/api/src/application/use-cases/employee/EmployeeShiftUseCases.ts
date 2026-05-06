import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

interface ShiftInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isWorking: boolean;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

@injectable()
export class SetEmployeeShiftsUseCase {
  /** Remplace integralement les shifts d'un employe (replace-all). */
  async execute(employeeId: string, shifts: ShiftInput[]) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundError('Employe', employeeId);

    for (const s of shifts) {
      if (s.dayOfWeek < 0 || s.dayOfWeek > 6) {
        throw new BusinessError(`dayOfWeek invalide : ${s.dayOfWeek}`);
      }
      if (s.isWorking) {
        if (!HHMM.test(s.startTime) || !HHMM.test(s.endTime)) {
          throw new BusinessError(`Heure invalide pour le jour ${s.dayOfWeek}`);
        }
        if (s.startTime >= s.endTime) {
          throw new BusinessError(`Heure de fin avant heure de debut (jour ${s.dayOfWeek})`);
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      await tx.employeeShift.deleteMany({ where: { employeeId } });
      if (shifts.length > 0) {
        await tx.employeeShift.createMany({
          data: shifts.map((s) => ({
            employeeId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime || '00:00',
            endTime: s.endTime || '00:00',
            isWorking: s.isWorking,
          })),
        });
      }
      return tx.employeeShift.findMany({
        where: { employeeId },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });
    });
  }
}

@injectable()
export class GetEmployeeShiftsUseCase {
  async execute(employeeId: string) {
    return prisma.employeeShift.findMany({
      where: { employeeId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }
}
