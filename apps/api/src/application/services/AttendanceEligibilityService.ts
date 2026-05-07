import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';

export type IneligibleReason =
  | 'ON_APPROVED_LEAVE'
  | 'SUSPENDED'
  | 'GLOBAL_HOLIDAY'
  | 'AGENCY_HOLIDAY'
  | 'EMPLOYEE_HOLIDAY'
  | 'REST_DAY'
  | 'NO_SCHEDULE'
  | 'EMPLOYEE_INACTIVE';

export interface EligibilityResult {
  eligible: boolean;
  reason?: IneligibleReason;
  /** Heures attendues (HH:mm) si jour ouvre. */
  expectedStart?: string;
  expectedEnd?: string;
  expectedBreakMinutes?: number;
  /** Identifiant de la source du planning : "agency" ou "employee". */
  scheduleSource?: 'agency' | 'employee';
}

/**
 * Service Phase 2 RH : determine si un employe peut etre pointe (PRESENT,
 * LATE, ABSENT) pour une date donnee. Bloque si :
 *   - employe inactif ou supprime
 *   - sanction SUSPENSION couvrant la date
 *   - conge APPROVED couvrant la date (et non cloture anticipement avant)
 *   - jour ferie/repos GLOBAL/AGENCY/EMPLOYEE
 *   - jour de repos du planning RH (employee override -> sinon agency)
 *
 * Calcule egalement les heures attendues depuis le planning RH effectif :
 *   - Employee.scheduleId si renseigne (override)
 *   - sinon Agency.workScheduleId
 *   - sinon EmployeeShift legacy (compat ascendante avant migration des plannings)
 */
@injectable()
export class AttendanceEligibilityService {
  async check(employeeId: string, date: Date): Promise<EligibilityResult> {
    // Normalise au jour UTC.
    const day = new Date(date);
    day.setUTCHours(0, 0, 0, 0);

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        schedule: { include: { days: true } },
        agency: {
          include: {
            workSchedule: { include: { days: true } },
          },
        },
        shifts: { where: { dayOfWeek: day.getUTCDay() } },
      },
    });
    if (!employee || !employee.isActive) {
      return { eligible: false, reason: 'EMPLOYEE_INACTIVE' };
    }

    // 1) Sanction SUSPENSION active sur cette date (effectiveFrom <= day <= effectiveTo OR effectiveTo null = indefini)
    const suspension = await prisma.employeeSanction.findFirst({
      where: {
        employeeId,
        type: 'SUSPENSION',
        effectiveFrom: { lte: day },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: day } },
        ],
      },
    });
    if (suspension) return { eligible: false, reason: 'SUSPENDED' };

    // 2) Conge APPROVED couvrant la date (en tenant compte d'une cloture anticipee).
    const leave = await prisma.employeeLeave.findFirst({
      where: {
        employeeId,
        status: { in: ['APPROVED', 'ENDED_EARLY'] },
        fromDate: { lte: day },
      },
    });
    if (leave) {
      // Determine la date de fin effective.
      const effectiveEnd =
        leave.status === 'ENDED_EARLY' && leave.endedEarlyAt
          ? new Date(leave.endedEarlyAt)
          : new Date(leave.toDate);
      effectiveEnd.setUTCHours(0, 0, 0, 0);
      if (day <= effectiveEnd) {
        return { eligible: false, reason: 'ON_APPROVED_LEAVE' };
      }
    }

    // 3) Holidays (GLOBAL > AGENCY > EMPLOYEE).
    const dayMonth = day.getUTCMonth();
    const dayDate = day.getUTCDate();
    const holidays = await prisma.holiday.findMany({
      where: {
        organizationId: employee.agency
          ? (await prisma.agency.findUnique({ where: { id: employee.agencyId }, select: { organizationId: true } }))?.organizationId
          : undefined,
        OR: [
          { scope: 'GLOBAL' },
          { scope: 'AGENCY', agencyId: employee.agencyId },
          { scope: 'EMPLOYEE', employeeId },
        ],
      },
    });
    for (const h of holidays) {
      const matches = h.isRecurring
        ? this.recurringDateMatches(h.fromDate, h.toDate, dayMonth, dayDate)
        : day >= new Date(h.fromDate) && day <= new Date(h.toDate);
      if (matches) {
        return {
          eligible: false,
          reason:
            h.scope === 'GLOBAL'
              ? 'GLOBAL_HOLIDAY'
              : h.scope === 'AGENCY'
                ? 'AGENCY_HOLIDAY'
                : 'EMPLOYEE_HOLIDAY',
        };
      }
    }

    // 4) Planning RH effectif.
    const dow = day.getUTCDay();
    let scheduleSource: 'agency' | 'employee' | undefined;
    let dayCfg: { startTime: string | null; endTime: string | null; breakMinutes: number; isWorking: boolean } | null = null;

    if (employee.schedule) {
      scheduleSource = 'employee';
      const d = employee.schedule.days.find((x) => x.dayOfWeek === dow);
      if (d) dayCfg = { startTime: d.startTime, endTime: d.endTime, breakMinutes: d.breakMinutes, isWorking: d.isWorking };
    } else if (employee.agency?.workSchedule) {
      scheduleSource = 'agency';
      const d = employee.agency.workSchedule.days.find((x) => x.dayOfWeek === dow);
      if (d) dayCfg = { startTime: d.startTime, endTime: d.endTime, breakMinutes: d.breakMinutes, isWorking: d.isWorking };
    } else if (employee.shifts.length > 0) {
      // Compat ascendante : EmployeeShift legacy.
      const s = employee.shifts[0];
      dayCfg = { startTime: s.startTime, endTime: s.endTime, breakMinutes: 0, isWorking: s.isWorking };
      scheduleSource = 'employee';
    }

    if (!dayCfg) {
      return { eligible: false, reason: 'NO_SCHEDULE' };
    }
    if (!dayCfg.isWorking) {
      return { eligible: false, reason: 'REST_DAY' };
    }

    return {
      eligible: true,
      expectedStart: dayCfg.startTime ?? undefined,
      expectedEnd: dayCfg.endTime ?? undefined,
      expectedBreakMinutes: dayCfg.breakMinutes,
      scheduleSource,
    };
  }

  /**
   * Calcule les metriques temporelles a partir des heures attendues et reelles.
   * Toutes les valeurs en minutes ; null si l'entree manque.
   */
  computeMetrics(opts: {
    expectedStart?: string;
    expectedEnd?: string;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    breakMinutes?: number;
  }) {
    const { expectedStart, expectedEnd, checkInTime, checkOutTime } = opts;
    const expS = expectedStart ? toMin(expectedStart) : null;
    const expE = expectedEnd ? toMin(expectedEnd) : null;
    const inM = checkInTime ? toMin(checkInTime) : null;
    const outM = checkOutTime ? toMin(checkOutTime) : null;

    const lateMinutes = expS !== null && inM !== null ? Math.max(0, inM - expS) : null;
    const earlyDepartureMinutes = expE !== null && outM !== null ? Math.max(0, expE - outM) : null;
    const overtimeMinutes =
      expE !== null && outM !== null ? Math.max(0, outM - expE) : null;
    const undertimeMinutes =
      lateMinutes !== null || earlyDepartureMinutes !== null
        ? (lateMinutes ?? 0) + (earlyDepartureMinutes ?? 0)
        : null;

    return {
      lateMinutes,
      earlyDepartureMinutes,
      overtimeMinutes,
      undertimeMinutes,
      breakMinutes: opts.breakMinutes ?? 0,
    };
  }

  private recurringDateMatches(from: Date, to: Date, m: number, d: number): boolean {
    const f = new Date(from);
    const t = new Date(to);
    // Recurrent : on ignore l'annee et on compare (mois, jour).
    const dayOfYear = m * 100 + d;
    const fromKey = f.getUTCMonth() * 100 + f.getUTCDate();
    const toKey = t.getUTCMonth() * 100 + t.getUTCDate();
    if (fromKey <= toKey) {
      return dayOfYear >= fromKey && dayOfYear <= toKey;
    }
    // Plage qui chevauche le 31/12 (rare mais possible)
    return dayOfYear >= fromKey || dayOfYear <= toKey;
  }
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
