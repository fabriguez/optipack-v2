import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';

/**
 * En fin de journee, marque ABSENT chaque employe ayant un shift planifie
 * aujourd'hui mais pas de pointage. Idempotent (skip si Attendance existe deja).
 *
 * Lance par cron a 23:30 UTC. On peut affiner par fuseau agence ulterieurement.
 */
@injectable()
export class AutoMarkAbsentUseCase {
  async execute(): Promise<{ marked: number }> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dow = today.getUTCDay();

    const employees = await prisma.employee.findMany({
      where: {
        isActive: true,
        shifts: { some: { dayOfWeek: dow, isWorking: true } },
      },
      select: { id: true },
    });

    let marked = 0;
    for (const emp of employees) {
      const existing = await prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId: emp.id, date: today } },
      });
      if (existing) continue;
      await prisma.attendance.create({
        data: {
          employeeId: emp.id,
          date: today,
          status: 'ABSENT',
          source: 'AUTO',
          reason: 'Aucun pointage en fin de journee',
        },
      });
      marked += 1;
    }
    return { marked };
  }
}
