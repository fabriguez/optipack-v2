import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';

interface Input {
  agencyId: string;
  /** Format YYYY-MM. Defaut : mois courant. */
  month?: string;
}

@injectable()
export class AgencyHRStatsUseCase {
  async execute({ agencyId, month }: Input) {
    const period = month ?? new Date().toISOString().slice(0, 7);
    const [year, m] = period.split('-').map(Number);
    const start = new Date(Date.UTC(year, m - 1, 1));
    const end = new Date(Date.UTC(year, m, 1));

    const [employees, attendances, leaves, sanctions, payslips] = await Promise.all([
      prisma.employee.findMany({
        where: { agencyId, isActive: true },
        select: { id: true, fullName: true, baseSalary: true, isAgencyManager: true },
      }),
      prisma.attendance.findMany({
        where: {
          date: { gte: start, lt: end },
          employee: { agencyId },
        },
        select: { id: true, employeeId: true, status: true, lateMinutes: true },
      }),
      prisma.employeeLeave.findMany({
        where: {
          employee: { agencyId },
          OR: [
            { fromDate: { gte: start, lt: end } },
            { toDate: { gte: start, lt: end } },
          ],
        },
        select: { id: true, status: true, type: true },
      }),
      prisma.employeeSanction.findMany({
        where: {
          employee: { agencyId },
          createdAt: { gte: start, lt: end },
        },
        select: { id: true, type: true },
      }),
      prisma.payslip.findMany({
        where: {
          employee: { agencyId },
          period,
        },
        select: { id: true, isPaid: true, netSalary: true },
      }),
    ]);

    const byEmployee: Record<string, { present: number; late: number; absent: number; onLeave: number }> = {};
    for (const a of attendances) {
      byEmployee[a.employeeId] ??= { present: 0, late: 0, absent: 0, onLeave: 0 };
      if (a.status === 'PRESENT') byEmployee[a.employeeId].present += 1;
      else if (a.status === 'LATE') byEmployee[a.employeeId].late += 1;
      else if (a.status === 'ABSENT') byEmployee[a.employeeId].absent += 1;
      else if (a.status === 'ON_LEAVE') byEmployee[a.employeeId].onLeave += 1;
    }

    const presentCount = attendances.filter((a) => a.status === 'PRESENT').length;
    const lateCount = attendances.filter((a) => a.status === 'LATE').length;
    const absentCount = attendances.filter((a) => a.status === 'ABSENT').length;
    const onLeaveCount = attendances.filter((a) => a.status === 'ON_LEAVE').length;
    const totalLateMinutes = attendances.reduce((s, a) => s + (a.lateMinutes ?? 0), 0);

    const payrollPaid = payslips
      .filter((p) => p.isPaid)
      .reduce((s, p) => s + Number(p.netSalary), 0);
    const payrollPending = payslips
      .filter((p) => !p.isPaid)
      .reduce((s, p) => s + Number(p.netSalary), 0);

    return {
      period,
      totalEmployees: employees.length,
      managersCount: employees.filter((e) => e.isAgencyManager).length,
      attendance: {
        present: presentCount,
        late: lateCount,
        absent: absentCount,
        onLeave: onLeaveCount,
        totalLateMinutes,
      },
      leaves: {
        approved: leaves.filter((l) => l.status === 'APPROVED').length,
        pending: leaves.filter((l) => l.status === 'PENDING').length,
        rejected: leaves.filter((l) => l.status === 'REJECTED').length,
      },
      sanctionsCount: sanctions.length,
      payroll: {
        paid: payrollPaid,
        pending: payrollPending,
        total: payrollPaid + payrollPending,
        payslipsCount: payslips.length,
      },
      // Vue par employe (top contributeurs en retards/absences)
      byEmployee: employees.map((e) => ({
        id: e.id,
        fullName: e.fullName,
        ...byEmployee[e.id] ?? { present: 0, late: 0, absent: 0, onLeave: 0 },
      })),
    };
  }
}
