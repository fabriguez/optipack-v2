import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

type LeaveType = 'PAID' | 'UNPAID' | 'SICK' | 'MATERNITY' | 'PATERNITY' | 'EXCEPTIONAL';

interface CreateInput {
  employeeId: string;
  type: LeaveType;
  fromDate: string | Date;
  toDate: string | Date;
  reason?: string;
}

@injectable()
export class RequestEmployeeLeaveUseCase {
  async execute(input: CreateInput, userId: string) {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new NotFoundError('Employe', input.employeeId);

    const from = new Date(input.fromDate);
    const to = new Date(input.toDate);
    if (isNaN(+from) || isNaN(+to)) throw new BusinessError('Dates invalides');
    if (from > to) throw new BusinessError('Date de fin avant date de debut');

    return prisma.employeeLeave.create({
      data: {
        employeeId: input.employeeId,
        type: input.type as any,
        fromDate: from,
        toDate: to,
        reason: input.reason ?? null,
        requestedByUserId: userId,
        status: 'PENDING',
      },
    });
  }
}

@injectable()
export class ValidateEmployeeLeaveUseCase {
  async execute(leaveId: string, decision: 'APPROVED' | 'REJECTED', userId: string, comment?: string) {
    const leave = await prisma.employeeLeave.findUnique({
      where: { id: leaveId },
      include: { employee: true },
    });
    if (!leave) throw new NotFoundError('Demande conge', leaveId);
    if (leave.status !== 'PENDING') throw new BusinessError('Demande deja traitee');

    const updated = await prisma.employeeLeave.update({
      where: { id: leaveId },
      data: {
        status: decision,
        validatedByUserId: userId,
        validatedAt: new Date(),
        validationComment: comment ?? null,
      },
    });

    // Si approuve : creer Attendance "ON_LEAVE" pour chaque jour de la periode.
    if (decision === 'APPROVED') {
      const dates: Date[] = [];
      const cur = new Date(leave.fromDate);
      cur.setUTCHours(0, 0, 0, 0);
      const last = new Date(leave.toDate);
      last.setUTCHours(0, 0, 0, 0);
      while (cur <= last) {
        dates.push(new Date(cur));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      for (const d of dates) {
        await prisma.attendance.upsert({
          where: { employeeId_date: { employeeId: leave.employeeId, date: d } },
          create: {
            employeeId: leave.employeeId,
            date: d,
            status: 'ON_LEAVE',
            reason: `Conge ${leave.type}`,
            source: 'AUTO',
            markedByUserId: userId,
          },
          update: {
            status: 'ON_LEAVE',
            reason: `Conge ${leave.type}`,
            markedByUserId: userId,
            source: 'AUTO',
          },
        });
      }
    }

    return updated;
  }
}

@injectable()
export class ListEmployeeLeavesUseCase {
  async execute(employeeId: string) {
    return prisma.employeeLeave.findMany({
      where: { employeeId },
      include: {
        validatedBy: { select: { id: true, firstName: true, lastName: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

@injectable()
export class ListAgencyPendingLeavesUseCase {
  async execute(agencyId: string) {
    return prisma.employeeLeave.findMany({
      where: {
        employee: { agencyId },
        status: 'PENDING',
      },
      include: {
        employee: { select: { id: true, fullName: true, position: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}

@injectable()
export class CancelEmployeeLeaveUseCase {
  async execute(leaveId: string) {
    const leave = await prisma.employeeLeave.findUnique({ where: { id: leaveId } });
    if (!leave) throw new NotFoundError('Conge', leaveId);
    if (leave.status === 'CANCELLED') return leave;
    return prisma.employeeLeave.update({
      where: { id: leaveId },
      data: { status: 'CANCELLED' },
    });
  }
}

/**
 * Cloture anticipee d'un conge approuve : passe le statut a ENDED_EARLY,
 * memorise endedEarlyAt + endedByUserId. Les Attendance ON_LEAVE strictement
 * posterieures a la date de fin anticipee sont supprimees pour permettre le
 * pointage normal a partir de cette date+1.
 */
@injectable()
export class EndEmployeeLeaveEarlyUseCase {
  async execute(leaveId: string, endDate: Date, userId: string, reason?: string) {
    const leave = await prisma.employeeLeave.findUnique({ where: { id: leaveId } });
    if (!leave) throw new NotFoundError('Conge', leaveId);
    if (leave.status !== 'APPROVED') {
      throw new BusinessError('Seuls les conges APPROVED peuvent etre cloturees anticipement');
    }
    const end = new Date(endDate);
    end.setUTCHours(0, 0, 0, 0);
    const from = new Date(leave.fromDate); from.setUTCHours(0, 0, 0, 0);
    const to = new Date(leave.toDate); to.setUTCHours(0, 0, 0, 0);
    if (end < from || end >= to) {
      throw new BusinessError('Date de fin anticipee hors plage du conge');
    }

    const updated = await prisma.employeeLeave.update({
      where: { id: leaveId },
      data: {
        status: 'ENDED_EARLY',
        endedEarlyAt: end,
        endedByUserId: userId,
        endReason: reason ?? null,
      },
    });

    // Supprime les Attendance ON_LEAVE creees automatiquement au-dela de la
    // date de cloture pour liberer ces jours au pointage normal.
    const dayAfter = new Date(end);
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
    await prisma.attendance.deleteMany({
      where: {
        employeeId: leave.employeeId,
        date: { gte: dayAfter, lte: to },
        status: 'ON_LEAVE',
        source: 'AUTO',
      },
    });

    return updated;
  }
}

/**
 * Cron quotidien : cloture automatiquement les conges dont toDate est passee.
 * Utilise pour eviter qu'un conge "APPROVED" reste en l'etat indefiniment et
 * pour declencher d'eventuelles notifications post-conge.
 */
@injectable()
export class AutoCloseExpiredLeavesUseCase {
  async execute(now: Date = new Date()) {
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    // Conges APPROVED dont toDate est strictement avant aujourd'hui : ils sont
    // termines normalement -- on ne change PAS le status (reste APPROVED, leur
    // fin etant deja portee par toDate). Cette methode existe pour les hooks
    // de notification ulterieurs ; on retourne juste la liste.
    const expired = await prisma.employeeLeave.findMany({
      where: { status: 'APPROVED', toDate: { lt: today } },
      select: { id: true, employeeId: true, toDate: true },
    });
    return { count: expired.length, leaves: expired };
  }
}
