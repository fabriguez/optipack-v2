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

  async execute(): Promise<{ closed: number; checked: number }> {
    const today = startOfDayUtc(new Date());

    const openRegisters = await prisma.agencyCashRegister.findMany({
      where: {
        isClosed: false,
        date: { gte: today },
      },
      include: {
        agency: {
          select: {
            id: true,
            name: true,
            timezone: true,
            openingHours: true,
          },
        },
      },
    });

    let closed = 0;

    for (const register of openRegisters) {
      const tz = register.agency.timezone || 'Africa/Douala';
      const local = nowInTimezone(tz);
      const localDow = local.getDay();
      const localTime = formatHHMM(local);

      const hoursForDay = (register.agency.openingHours as Array<{
        dayOfWeek: number;
        closeTime: string;
        isOpen: boolean;
      }>).filter((h) => h.dayOfWeek === localDow && h.isOpen);

      // Si pas de plage configuree pour ce jour : on ne ferme pas auto.
      if (hoursForDay.length === 0) continue;

      const latestClose = hoursForDay.reduce(
        (acc, h) => (h.closeTime > acc ? h.closeTime : acc),
        '00:00',
      );

      if (localTime >= latestClose) {
        await this.cashRegisterRepo.update(register.id, {
          isClosed: true,
          closedAt: new Date(),
          closingBalance: register.currentBalance,
          notes:
            (register.notes ? register.notes + '\n' : '') +
            `Cloture automatique de fin de journee (${tz}, ${localTime}).`,
        });

        // Genere le rapport journalier
        try {
          await this.reportService.generate(register.agencyId, register.date);
        } catch {
          // Best-effort : un echec rapport ne doit pas bloquer la fermeture caisse
        }

        eventBus.emit({
          type: DomainEvents.CASH_REGISTER_CLOSED,
          payload: {
            registerId: register.id,
            agencyId: register.agencyId,
            closingBalance: Number(register.currentBalance),
            auto: true,
          },
          timestamp: new Date(),
          userId: undefined,
        });
        closed += 1;
      }
    }

    return { closed, checked: openRegisters.length };
  }
}

function startOfDayUtc(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
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
