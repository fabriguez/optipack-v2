import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { AttendanceEligibilityService } from '../../services/AttendanceEligibilityService';

type Status = 'PRESENT' | 'LATE' | 'ABSENT' | 'ON_LEAVE' | 'HOLIDAY';

interface MarkInput {
  employeeId: string;
  date: string | Date;
  status: Status;
  checkInTime?: string;
  checkOutTime?: string;
  reason?: string;
  note?: string;
  /** Si true, ignore le verrou eligibilite (ex: correction admin sur jour ferie). */
  force?: boolean;
}

@injectable()
export class MarkAttendanceUseCase {
  constructor(private eligibility: AttendanceEligibilityService) {}

  async execute(input: MarkInput, userId: string) {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new NotFoundError('Employe', input.employeeId);

    const date = new Date(input.date);
    date.setUTCHours(0, 0, 0, 0);

    const elig = await this.eligibility.check(input.employeeId, date);

    // Verrou metier : on ne peut pas marquer PRESENT/LATE/ABSENT pendant un
    // conge, une suspension, un ferie ou un jour de repos.
    const isPointageStatus = input.status === 'PRESENT' || input.status === 'LATE' || input.status === 'ABSENT';
    if (isPointageStatus && !elig.eligible && !input.force) {
      throw new BusinessError(
        `Pointage impossible : ${this.humanReason(elig.reason)}. Utilisez force=true pour outrepasser.`,
      );
    }

    if (input.status === 'LATE' && !input.checkInTime) {
      throw new BusinessError("checkInTime requis pour status LATE");
    }

    // Calcule les metriques (lateMinutes, overtime, etc.) si pointage valide.
    const metrics = isPointageStatus
      ? this.eligibility.computeMetrics({
          expectedStart: elig.expectedStart,
          expectedEnd: elig.expectedEnd,
          checkInTime: input.checkInTime,
          checkOutTime: input.checkOutTime,
          breakMinutes: elig.expectedBreakMinutes,
        })
      : null;

    const data = {
      status: input.status as any,
      checkInTime: input.checkInTime ?? null,
      checkOutTime: input.checkOutTime ?? null,
      reason: input.reason ?? null,
      note: input.note ?? null,
      expectedStart: elig.expectedStart ?? null,
      expectedEnd: elig.expectedEnd ?? null,
      lateMinutes: metrics?.lateMinutes ?? null,
      earlyDepartureMinutes: metrics?.earlyDepartureMinutes ?? null,
      overtimeMinutes: metrics?.overtimeMinutes ?? null,
      undertimeMinutes: metrics?.undertimeMinutes ?? null,
      breakMinutes: metrics?.breakMinutes ?? 0,
      markedByUserId: userId,
      source: 'MANUAL' as const,
    };

    return prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: input.employeeId, date } },
      create: { employeeId: input.employeeId, date, ...data },
      update: data,
    });
  }

  private humanReason(r?: string): string {
    switch (r) {
      case 'ON_APPROVED_LEAVE': return "l'employe est en conge approuve";
      case 'SUSPENDED': return "l'employe est sous mise a pied";
      case 'GLOBAL_HOLIDAY': return 'jour ferie (organisation)';
      case 'AGENCY_HOLIDAY': return "jour ferie/fermeture d'agence";
      case 'EMPLOYEE_HOLIDAY': return "repos planifie de l'employe";
      case 'REST_DAY': return 'jour de repos selon le planning';
      case 'NO_SCHEDULE': return "aucun planning RH defini pour cet employe";
      case 'EMPLOYEE_INACTIVE': return 'employe inactif';
      default: return 'condition non remplie';
    }
  }
}

/** Mise a jour (ou ajout) du seul check-out, avec recalcul des metriques. */
@injectable()
export class CheckOutAttendanceUseCase {
  constructor(private eligibility: AttendanceEligibilityService) {}

  async execute(employeeId: string, date: Date, checkOutTime: string, userId: string) {
    const day = new Date(date);
    day.setUTCHours(0, 0, 0, 0);

    const att = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: day } },
    });
    if (!att) throw new NotFoundError('Pointage', `${employeeId}@${day.toISOString().slice(0, 10)}`);
    if (att.status !== 'PRESENT' && att.status !== 'LATE') {
      throw new BusinessError('Check-out applicable uniquement sur PRESENT/LATE');
    }

    const elig = await this.eligibility.check(employeeId, day);
    const metrics = this.eligibility.computeMetrics({
      expectedStart: elig.expectedStart ?? att.expectedStart ?? undefined,
      expectedEnd: elig.expectedEnd ?? att.expectedEnd ?? undefined,
      checkInTime: att.checkInTime,
      checkOutTime,
      breakMinutes: elig.expectedBreakMinutes ?? att.breakMinutes ?? 0,
    });

    return prisma.attendance.update({
      where: { id: att.id },
      data: {
        checkOutTime,
        earlyDepartureMinutes: metrics.earlyDepartureMinutes,
        overtimeMinutes: metrics.overtimeMinutes,
        undertimeMinutes: metrics.undertimeMinutes,
        markedByUserId: userId,
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
      include: {
        justifications: {
          orderBy: { createdAt: 'desc' },
          include: { attachments: true },
        },
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

/**
 * Statistiques RH a la demande pour un employe sur une periode.
 * Calcul a la volee (pas de denormalisation) : agrege Attendance.
 */
@injectable()
export class EmployeeAttendanceStatsUseCase {
  async execute(employeeId: string, from: Date, to: Date) {
    const fromDay = new Date(from); fromDay.setUTCHours(0, 0, 0, 0);
    const toDay = new Date(to); toDay.setUTCHours(0, 0, 0, 0);

    const rows = await prisma.attendance.findMany({
      where: { employeeId, date: { gte: fromDay, lte: toDay } },
      select: {
        status: true,
        lateMinutes: true,
        earlyDepartureMinutes: true,
        overtimeMinutes: true,
        undertimeMinutes: true,
      },
    });

    const stats = {
      from: fromDay.toISOString().slice(0, 10),
      to: toDay.toISOString().slice(0, 10),
      totalDays: rows.length,
      presentDays: 0,
      lateDays: 0,
      absentDays: 0,
      onLeaveDays: 0,
      holidayDays: 0,
      totalLateMinutes: 0,
      totalEarlyDepartureMinutes: 0,
      totalOvertimeMinutes: 0,
      totalUndertimeMinutes: 0,
      attendanceRate: 0,
    };

    for (const r of rows) {
      switch (r.status) {
        case 'PRESENT': stats.presentDays++; break;
        case 'LATE': stats.lateDays++; break;
        case 'ABSENT': stats.absentDays++; break;
        case 'ON_LEAVE': stats.onLeaveDays++; break;
        case 'HOLIDAY': stats.holidayDays++; break;
      }
      stats.totalLateMinutes += r.lateMinutes ?? 0;
      stats.totalEarlyDepartureMinutes += r.earlyDepartureMinutes ?? 0;
      stats.totalOvertimeMinutes += r.overtimeMinutes ?? 0;
      stats.totalUndertimeMinutes += r.undertimeMinutes ?? 0;
    }

    const workingDays = stats.presentDays + stats.lateDays + stats.absentDays;
    stats.attendanceRate = workingDays > 0
      ? +(((stats.presentDays + stats.lateDays) / workingDays) * 100).toFixed(2)
      : 0;

    return stats;
  }
}
