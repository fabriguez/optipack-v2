import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

type Status = 'PRESENT' | 'LATE' | 'ABSENT' | 'ON_LEAVE' | 'HOLIDAY';

interface MarkInput {
  employeeId: string;
  date: string | Date;
  status: Status;
  checkInTime?: string;
  checkOutTime?: string;
  reason?: string;
  note?: string;
}

@injectable()
export class MarkAttendanceUseCase {
  async execute(input: MarkInput, userId: string) {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new NotFoundError('Employe', input.employeeId);

    const date = new Date(input.date);
    date.setUTCHours(0, 0, 0, 0);

    if (input.status === 'LATE' && !input.checkInTime) {
      throw new BusinessError("checkInTime requis pour status LATE");
    }

    // Calcul lateMinutes : si checkInTime > start prévu du shift du jour
    let lateMinutes: number | null = null;
    if (input.status === 'LATE' && input.checkInTime) {
      const dow = date.getUTCDay();
      const shift = await prisma.employeeShift.findFirst({
        where: { employeeId: input.employeeId, dayOfWeek: dow, isWorking: true },
        orderBy: { startTime: 'asc' },
      });
      if (shift) {
        const [sh, sm] = shift.startTime.split(':').map(Number);
        const [ch, cm] = input.checkInTime.split(':').map(Number);
        lateMinutes = Math.max(0, ch * 60 + cm - (sh * 60 + sm));
      }
    }

    return prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: input.employeeId, date } },
      create: {
        employeeId: input.employeeId,
        date,
        status: input.status as any,
        checkInTime: input.checkInTime ?? null,
        checkOutTime: input.checkOutTime ?? null,
        reason: input.reason ?? null,
        note: input.note ?? null,
        lateMinutes,
        markedByUserId: userId,
        source: 'MANUAL',
      },
      update: {
        status: input.status as any,
        checkInTime: input.checkInTime ?? null,
        checkOutTime: input.checkOutTime ?? null,
        reason: input.reason ?? null,
        note: input.note ?? null,
        lateMinutes,
        markedByUserId: userId,
        source: 'MANUAL',
      },
    });
  }
}

@injectable()
export class ListEmployeeAttendanceUseCase {
  async execute(employeeId: string, from?: Date, to?: Date) {
    return prisma.attendance.findMany({
      where: {
        employeeId,
        ...(from || to
          ? { date: { ...(from && { gte: from }), ...(to && { lte: to }) } }
          : {}),
      },
      orderBy: { date: 'desc' },
      take: 200,
    });
  }
}

/** Pointage agence pour un jour donne : tous les employes actifs avec leur pointage du jour. */
@injectable()
export class ListAgencyAttendanceForDateUseCase {
  async execute(agencyId: string, date: Date) {
    const day = new Date(date);
    day.setUTCHours(0, 0, 0, 0);
    const employees = await prisma.employee.findMany({
      where: { agencyId, isActive: true },
      include: {
        attendances: {
          where: { date: day },
        },
        shifts: {
          where: { dayOfWeek: day.getUTCDay() },
        },
      },
      orderBy: { fullName: 'asc' },
    });
    return { date: day.toISOString().slice(0, 10), employees };
  }
}
