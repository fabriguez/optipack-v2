import { inject, injectable } from 'tsyringe';
import ExcelJS from 'exceljs';
import { prisma } from '../../../config/database';
import { AgencyHRStatsUseCase } from './AgencyHRStatsUseCase';

interface Input {
  agencyId: string;
  /** YYYY-MM */
  month?: string;
}

const FILL_HEADER = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1B5E20' },
} as ExcelJS.FillPattern;

@injectable()
export class AgencyHRReportXlsxUseCase {
  constructor(private statsUseCase: AgencyHRStatsUseCase) {}

  async execute({ agencyId, month }: Input): Promise<{ buffer: Buffer; fileName: string }> {
    const period = month ?? new Date().toISOString().slice(0, 7);
    const [year, m] = period.split('-').map(Number);
    const start = new Date(Date.UTC(year, m - 1, 1));
    const end = new Date(Date.UTC(year, m, 1));
    const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();

    const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
    const stats = await this.statsUseCase.execute({ agencyId, month: period });

    const employees = await prisma.employee.findMany({
      where: { agencyId, isActive: true },
      include: {
        attendances: { where: { date: { gte: start, lt: end } } },
      },
      orderBy: { fullName: 'asc' },
    });

    const leaves = await prisma.employeeLeave.findMany({
      where: {
        employee: { agencyId },
        OR: [
          { fromDate: { gte: start, lt: end } },
          { toDate: { gte: start, lt: end } },
        ],
      },
      include: { employee: { select: { fullName: true } } },
      orderBy: { fromDate: 'asc' },
    });

    const sanctions = await prisma.employeeSanction.findMany({
      where: { employee: { agencyId }, createdAt: { gte: start, lt: end } },
      include: { employee: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const payslips = await prisma.payslip.findMany({
      where: { employee: { agencyId }, period },
      include: { employee: { select: { fullName: true, position: true } } },
      orderBy: { generatedAt: 'desc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Export';
    wb.created = new Date();

    // ----- Sheet 1 : Synthese -----
    const synthese = wb.addWorksheet('Synthese');
    synthese.columns = [{ width: 40 }, { width: 20 }];
    synthese.addRow([`Rapport RH - ${agency?.name ?? agencyId} - ${period}`, '']);
    synthese.getRow(1).font = { bold: true, size: 14 };
    synthese.addRow([]);
    synthese.addRow(['Effectifs actifs', stats.totalEmployees]);
    synthese.addRow(['Chefs d\'agence', stats.managersCount]);
    synthese.addRow([]);
    synthese.addRow(['Pointage du mois', '']).font = { bold: true };
    synthese.addRow(['  Presents', stats.attendance.present]);
    synthese.addRow(['  Retards', stats.attendance.late]);
    synthese.addRow(['  Absents', stats.attendance.absent]);
    synthese.addRow(['  En conge', stats.attendance.onLeave]);
    synthese.addRow(['  Minutes de retard cumulees', stats.attendance.totalLateMinutes]);
    synthese.addRow([]);
    synthese.addRow(['Conges', '']).font = { bold: true };
    synthese.addRow(['  Approuves', stats.leaves.approved]);
    synthese.addRow(['  En attente', stats.leaves.pending]);
    synthese.addRow(['  Refuses', stats.leaves.rejected]);
    synthese.addRow([]);
    synthese.addRow(['Sanctions du mois', stats.sanctionsCount]);
    synthese.addRow([]);
    synthese.addRow(['Masse salariale', '']).font = { bold: true };
    synthese.addRow(['  Payee', stats.payroll.paid]);
    synthese.addRow(['  En attente', stats.payroll.pending]);
    synthese.addRow(['  Total', stats.payroll.total]);

    // ----- Sheet 2 : Pointage detaille -----
    const att = wb.addWorksheet('Pointage');
    const days = Array.from({ length: lastDay }, (_, i) => i + 1);
    att.columns = [
      { header: 'Employe', key: 'name', width: 28 },
      ...days.map((d) => ({ header: String(d), key: `d${d}`, width: 5 })),
      { header: 'P', key: 'p', width: 5 },
      { header: 'R', key: 'r', width: 5 },
      { header: 'A', key: 'a', width: 5 },
      { header: 'C', key: 'c', width: 5 },
      { header: 'Min retard', key: 'lm', width: 10 },
    ];
    att.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    att.getRow(1).fill = FILL_HEADER;

    const STATUS_CHAR: Record<string, string> = {
      PRESENT: 'P',
      LATE: 'R',
      ABSENT: 'A',
      ON_LEAVE: 'C',
      HOLIDAY: 'F',
    };
    for (const e of employees) {
      const byDay: Record<number, string> = {};
      let lm = 0;
      for (const a of e.attendances) {
        const d = new Date(a.date).getUTCDate();
        byDay[d] = STATUS_CHAR[a.status] ?? '?';
        lm += a.lateMinutes ?? 0;
      }
      const row: any = { name: e.fullName, lm };
      let p = 0, r = 0, ab = 0, c = 0;
      for (const d of days) {
        const ch = byDay[d] ?? '';
        row[`d${d}`] = ch;
        if (ch === 'P') p++;
        else if (ch === 'R') r++;
        else if (ch === 'A') ab++;
        else if (ch === 'C') c++;
      }
      row.p = p;
      row.r = r;
      row.a = ab;
      row.c = c;
      att.addRow(row);
    }

    // Legende
    att.addRow([]);
    att.addRow(['Legende : P=Present, R=Retard, A=Absent, C=Conge, F=Ferie, vide=Non pointe']);

    // ----- Sheet 3 : Conges -----
    const leavesSheet = wb.addWorksheet('Conges');
    leavesSheet.columns = [
      { header: 'Employe', key: 'name', width: 28 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Du', key: 'from', width: 12 },
      { header: 'Au', key: 'to', width: 12 },
      { header: 'Statut', key: 'status', width: 12 },
      { header: 'Motif', key: 'reason', width: 40 },
    ];
    leavesSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    leavesSheet.getRow(1).fill = FILL_HEADER;
    for (const l of leaves) {
      leavesSheet.addRow({
        name: l.employee.fullName,
        type: l.type,
        from: new Date(l.fromDate).toISOString().slice(0, 10),
        to: new Date(l.toDate).toISOString().slice(0, 10),
        status: l.status,
        reason: l.reason ?? '',
      });
    }

    // ----- Sheet 4 : Sanctions -----
    const sancSheet = wb.addWorksheet('Sanctions');
    sancSheet.columns = [
      { header: 'Employe', key: 'name', width: 28 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Effet du', key: 'from', width: 12 },
      { header: 'Au', key: 'to', width: 12 },
      { header: 'Motif', key: 'reason', width: 50 },
    ];
    sancSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sancSheet.getRow(1).fill = FILL_HEADER;
    for (const s of sanctions) {
      sancSheet.addRow({
        name: s.employee.fullName,
        type: s.type,
        from: new Date(s.effectiveFrom).toISOString().slice(0, 10),
        to: s.effectiveTo ? new Date(s.effectiveTo).toISOString().slice(0, 10) : '',
        reason: s.reason,
      });
    }

    // ----- Sheet 5 : Salaires -----
    const paySheet = wb.addWorksheet('Salaires');
    paySheet.columns = [
      { header: 'Employe', key: 'name', width: 28 },
      { header: 'Poste', key: 'pos', width: 20 },
      { header: 'Brut', key: 'gross', width: 14 },
      { header: 'Retenues', key: 'ded', width: 14 },
      { header: 'Net', key: 'net', width: 14 },
      { header: 'Statut', key: 'status', width: 12 },
      { header: 'Note', key: 'note', width: 30 },
    ];
    paySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    paySheet.getRow(1).fill = FILL_HEADER;
    for (const p of payslips) {
      paySheet.addRow({
        name: p.employee.fullName,
        pos: p.employee.position,
        gross: Number(p.grossSalary),
        ded: p.deductionsTotal != null ? Number(p.deductionsTotal) : 0,
        net: Number(p.netSalary),
        status: p.isPaid ? 'Paye' : 'En attente',
        note: p.paymentNote ?? '',
      });
    }

    const arr = await wb.xlsx.writeBuffer();
    const buffer = Buffer.from(arr as ArrayBuffer);
    const fileName = `rh-${agency?.code ?? agencyId}-${period}.xlsx`;
    return { buffer, fileName };
  }
}
