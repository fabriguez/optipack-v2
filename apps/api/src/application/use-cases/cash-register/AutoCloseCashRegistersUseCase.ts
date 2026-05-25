import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { DailyReportService } from '../../services/DailyReportService';

/**
 * Cloture automatique de fin de journee.
 *
 * Pour chaque agence avec une caisse ouverte aujourd'hui :
 *  - On determine l'heure courante DANS le fuseau de l'agence.
 *  - On determine l'heure de fermeture du jour (max(closeTime) parmi les plages
 *    AgencyOpeningHours du jour si l'agence est ouverte).
 *  - Si l'heure courante locale > closeTime du jour, on ferme la caisse et on
 *    emet un evenement (rapport de fin de journee).
 *
 * Le cron tourne toutes les 10 minutes : la fermeture se declenche dans les 10
 * minutes apres l'heure configuree.
 */
@injectable()
export class AutoCloseCashRegistersUseCase {
  constructor(
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
    private reportService: DailyReportService,
  ) {}

  async execute(): Promise<{ closed: number; checked: number; reported: number }> {
    // On itere sur TOUTES les agences (avec horaires d'ouverture). Pour chaque
    // agence dont l'heure de fermeture locale est depassee, on ferme la caisse
    // (si ouverte) ET on genere le rapport (meme s'il n'y a pas eu d'activite).
    const agencies = await prisma.agency.findMany({
      where: { isActive: true },
      select: { id: true, name: true, timezone: true, openingHours: true },
    });

    let closed = 0;
    let reported = 0;

    for (const agency of agencies) {
      const tz = agency.timezone || 'Africa/Douala';
      const local = nowInTimezone(tz);
      const localDow = local.getDay();
      const localTime = formatHHMM(local);

      const hoursForDay = (agency.openingHours as Array<{
        dayOfWeek: number;
        closeTime: string;
        isOpen: boolean;
      }>).filter((h) => h.dayOfWeek === localDow && h.isOpen);

      if (hoursForDay.length === 0) continue;

      const latestClose = hoursForDay.reduce(
        (acc, h) => (h.closeTime > acc ? h.closeTime : acc),
        '00:00',
      );
      if (localTime < latestClose) continue;

      // Date "aujourd'hui" dans le fuseau de l'agence (pour matcher caisse).
      const localDayStart = startOfDayInTimezone(new Date(), tz);

      // Tente de fermer la caisse ouverte d'aujourd'hui (si existante).
      const register = await prisma.agencyCashRegister.findFirst({
        where: {
          agencyId: agency.id,
          isClosed: false,
          date: { gte: localDayStart, lt: new Date(localDayStart.getTime() + 24 * 60 * 60 * 1000) },
        },
      });

      if (register) {
        await this.cashRegisterRepo.update(register.id, {
          isClosed: true,
          closedAt: new Date(),
          closingBalance: register.currentBalance,
          notes:
            (register.notes ? register.notes + '\n' : '') +
            `Cloture automatique de fin de journee (${tz}, ${localTime}).`,
        });
        eventBus.emit({
          type: DomainEvents.CASH_REGISTER_CLOSED,
          payload: {
            registerId: register.id,
            agencyId: agency.id,
            closingBalance: Number(register.currentBalance),
            auto: true,
          },
          timestamp: new Date(),
          userId: undefined,
        });
        closed += 1;
      }

      // Generation rapport journalier : meme sans caisse, on cree un rapport
      // (eventuellement vide) pour tracer la journee. Idempotent : upsert.
      try {
        await this.reportService.generate(agency.id, localDayStart);
        reported += 1;
      } catch {
        // Best-effort
      }
    }

    return { closed, checked: agencies.length, reported };
  }
}

function startOfDayInTimezone(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), 0, 0, 0, 0));
}

function nowInTimezone(timeZone: string): Date {
  // Reconstruit un Date "naif" represantant l'heure locale dans le fuseau cible.
  // On formate la date dans le fuseau, puis on parse les composantes.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(fmt.find((p) => p.type === t)?.value ?? 0);
  return new Date(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second'),
  );
}

function formatHHMM(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
