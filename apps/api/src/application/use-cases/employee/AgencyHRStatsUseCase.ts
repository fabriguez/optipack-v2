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
        select: {
          id: true,
          employeeId: true,
          status: true,
          lateMinutes: true,
          earlyDepartureMinutes: true,
          overtimeMinutes: true,
          undertimeMinutes: true,
        },
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
        select: { id: true, isPaid: true, netSalary: true, paidAmount: true },
      }),
    ]);

    const byEmployee: Record<string, {
      present: number; late: number; absent: number; onLeave: number;
      lateMinutes: number; earlyDepartureMinutes: number; overtimeMinutes: number; undertimeMinutes: number;
    }> = {};
    for (const a of attendances) {
      byEmployee[a.employeeId] ??= {
        present: 0, late: 0, absent: 0, onLeave: 0,
        lateMinutes: 0, earlyDepartureMinutes: 0, overtimeMinutes: 0, undertimeMinutes: 0,
      };
      const slot = byEmployee[a.employeeId];
      if (a.status === 'PRESENT') slot.present += 1;
      else if (a.status === 'LATE') slot.late += 1;
      else if (a.status === 'ABSENT') slot.absent += 1;
      else if (a.status === 'ON_LEAVE') slot.onLeave += 1;
      slot.lateMinutes += a.lateMinutes ?? 0;
      slot.earlyDepartureMinutes += a.earlyDepartureMinutes ?? 0;
      slot.overtimeMinutes += a.overtimeMinutes ?? 0;
      slot.undertimeMinutes += a.undertimeMinutes ?? 0;
    }

    const presentCount = attendances.filter((a) => a.status === 'PRESENT').length;
    const lateCount = attendances.filter((a) => a.status === 'LATE').length;
    const absentCount = attendances.filter((a) => a.status === 'ABSENT').length;
    const onLeaveCount = attendances.filter((a) => a.status === 'ON_LEAVE').length;
    const totalLateMinutes = attendances.reduce((s, a) => s + (a.lateMinutes ?? 0), 0);
    const totalEarlyDepartureMinutes = attendances.reduce((s, a) => s + (a.earlyDepartureMinutes ?? 0), 0);
    const totalOvertimeMinutes = attendances.reduce((s, a) => s + (a.overtimeMinutes ?? 0), 0);
    const totalUndertimeMinutes = attendances.reduce((s, a) => s + (a.undertimeMinutes ?? 0), 0);

    // Masse salariale theorique = somme des salaires de base des employes
    // actifs (identique a la charge auto "Masse salariale" sur l'agence).
    // C'est ce chiffre qui sert de reference budgetaire, pas la somme des
    // payslips emis (qui ne couvre que les periodes effectivement traitees).
    const theoreticalMass = employees.reduce((s, e) => s + Number(e.baseSalary ?? 0), 0);

    // Paid = somme cumulee des versements effectivement debites (gere les
    // paiements partiels grace a paidAmount). Pending = reste a payer sur les
    // payslips emis pour la periode. Total emis = somme des netSalary.
    const payrollPaid = payslips.reduce((s, p) => s + Number(p.paidAmount ?? 0), 0);
    const payrollPending = payslips.reduce(
      (s, p) => s + Math.max(0, Number(p.netSalary) - Number(p.paidAmount ?? 0)),
      0,
    );
    const payrollIssued = payslips.reduce((s, p) => s + Number(p.netSalary), 0);

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
        totalEarlyDepartureMinutes,
        totalOvertimeMinutes,
        totalUndertimeMinutes,
      },
      leaves: {
        approved: leaves.filter((l) => l.status === 'APPROVED').length,
        pending: leaves.filter((l) => l.status === 'PENDING').length,
        rejected: leaves.filter((l) => l.status === 'REJECTED').length,
      },
      sanctionsCount: sanctions.length,
      payroll: {
        // Reference budgetaire = masse salariale theorique mensuelle
        // (== AgencyCharge SALARY auto-managee). C'est le meme chiffre que la
        // tab Charges, garanti coherent.
        theoreticalMass,
        paid: payrollPaid,
        pending: payrollPending,
        issued: payrollIssued,
        // Conserve pour compat affichage existant (total emis sur la periode).
        total: payrollIssued,
        payslipsCount: payslips.length,
      },
      // Vue par employe (top contributeurs en retards/absences)
      byEmployee: employees.map((e) => ({
        id: e.id,
        fullName: e.fullName,
        ...byEmployee[e.id] ?? {
          present: 0, late: 0, absent: 0, onLeave: 0,
          lateMinutes: 0, earlyDepartureMinutes: 0, overtimeMinutes: 0, undertimeMinutes: 0,
        },
      })),
    };
  }
}
