import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { DailyReportService } from '../../services/DailyReportService';
import { startOfDayInTimezone } from '../../../domain/utils/timezone';
import { createChildLogger } from '../../../config/logger';

const logger = createChildLogger('AutoClose');

/**
 * Cloture automatique de fin de journee (caisse + RAPPORT JOURNALIER).
 *
 * Pour chaque agence active, des que l'heure locale depasse l'heure de
 * fermeture du jour (max(closeTime) des plages AgencyOpeningHours du jour) :
 *  1. La caisse du jour (si ouverte) est fermee.
 *  2. Le rapport journalier est genere puis passe en CLOSED (snapshot fige).
 *     La fenetre du rapport court de la cloture du rapport precedent jusqu'a
 *     cette fermeture (cf DailyReportService) : colis, conteneurs, paiements,
 *     stock -- toutes les donnees suivent cette fenetre.
 *  3. L'event CASH_REGISTER_CLOSED est emis APRES la cloture du rapport, pour
 *     que l'envoi mail (DailyReportEmailHandler) parte avec le snapshot final.
 *
 * Le cron tourne toutes les 15 secondes : la cloture intervient au plus 15 s
 * apres l'heure configuree. Le passage est IDEMPOTENT et quasi gratuit a vide
 * (2 requetes) : un rapport deja CLOSED/AMENDED est saute, une caisse deja
 * fermee aussi.
 *
 * Balayage complementaire : toute caisse restee ouverte sur un jour PASSE
 * (y compris jour ferme type dimanche, jamais couvert par la cloture horaire)
 * est fermee d'office.
 */
@injectable()
export class AutoCloseCashRegistersUseCase {
  constructor(
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
    private reportService: DailyReportService,
  ) {}

  async execute(): Promise<{ closed: number; checked: number; reported: number; reportsClosed: number }> {
    const agencies = await prisma.agency.findMany({
      where: { isActive: true },
      select: { id: true, name: true, timezone: true, openingHours: true },
    });

    let closed = 0;
    let reported = 0;
    let reportsClosed = 0;
    if (agencies.length === 0) return { closed, checked: 0, reported, reportsClosed };

    // Une seule requete pour toutes les caisses encore ouvertes.
    const openRegisters = await prisma.agencyCashRegister.findMany({
      where: { isClosed: false, agencyId: { in: agencies.map((a) => a.id) } },
    });

    // Rattrapage : rapports de jours PASSES restes GENERATED (historique
    // d'avant la cloture auto, ou downtime du serveur a l'heure de
    // fermeture). Journee finie -> regeneration finale + CLOSED. Plafonne
    // par passage pour lisser la charge (le cron tourne toutes les 15 s).
    const staleReports = await prisma.agencyDailyReport.findMany({
      where: { status: 'GENERATED', agencyId: { in: agencies.map((a) => a.id) } },
      select: { id: true, agencyId: true, date: true },
      orderBy: { date: 'asc' },
    });
    const dayStartByAgency = new Map(
      agencies.map((a) => [a.id, startOfDayInTimezone(new Date(), a.timezone || 'Africa/Douala')]),
    );
    const backlog = staleReports.filter((r) => {
      const dayStart = dayStartByAgency.get(r.agencyId);
      return dayStart ? r.date < dayStart : false;
    });
    const openByAgency = new Map<string, typeof openRegisters>();
    for (const r of openRegisters) {
      if (!openByAgency.has(r.agencyId)) openByAgency.set(r.agencyId, []);
      openByAgency.get(r.agencyId)!.push(r);
    }

    for (const r of backlog.slice(0, 10)) {
      try {
        // Regeneration finale (fenetre bornee par les regles courantes)
        // puis gel. Non-force : un rapport deja CLOSED n'est pas touche.
        const { id } = await this.reportService.generate(r.agencyId, r.date);
        await prisma.agencyDailyReport.update({
          where: { id },
          data: { status: 'CLOSED', closedAt: new Date() },
        });
        reportsClosed += 1;
      } catch (err) {
        logger.error({ err, agencyId: r.agencyId, date: r.date }, 'Backfill cloture rapport journalier echoue');
      }
    }

    // Agences dont l'heure de fermeture est passee : candidates a la cloture
    // du rapport du jour. `justClosedRegister` = caisse fermee dans CE passage
    // (event emis apres la cloture du rapport).
    const candidates: Array<{
      agencyId: string;
      dayStart: Date;
      tz: string;
      localTime: string;
      justClosedRegister: { id: string; closingBalance: number } | null;
    }> = [];

    for (const agency of agencies) {
      const tz = agency.timezone || 'Africa/Douala';
      const local = nowInTimezone(tz);
      const localDow = local.getDay();
      const localTime = formatHHMM(local);
      const localDayStart = startOfDayInTimezone(new Date(), tz);
      const regs = openByAgency.get(agency.id) ?? [];

      // Caisses restees ouvertes sur des jours passes : cloture d'office.
      for (const stale of regs.filter((r) => r.date < localDayStart)) {
        await this.cashRegisterRepo.update(stale.id, {
          isClosed: true,
          closedAt: new Date(),
          closingBalance: stale.currentBalance,
          notes:
            (stale.notes ? stale.notes + '\n' : '') +
            'Cloture automatique : caisse restee ouverte apres son jour.',
        });
        eventBus.emit({
          type: DomainEvents.CASH_REGISTER_CLOSED,
          payload: {
            registerId: stale.id,
            agencyId: agency.id,
            closingBalance: Number(stale.currentBalance),
            auto: true,
          },
          timestamp: new Date(),
          userId: undefined,
        });
        closed += 1;
        try {
          await this.reportService.generate(agency.id, stale.date);
          reported += 1;
        } catch {
          // Best-effort
        }
      }

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

      // Heure de fermeture depassee : ferme la caisse du jour si encore ouverte.
      let justClosedRegister: { id: string; closingBalance: number } | null = null;
      const todayReg = regs.find((r) => r.date.getTime() === localDayStart.getTime());
      if (todayReg) {
        await this.cashRegisterRepo.update(todayReg.id, {
          isClosed: true,
          closedAt: new Date(),
          closingBalance: todayReg.currentBalance,
          notes:
            (todayReg.notes ? todayReg.notes + '\n' : '') +
            `Cloture automatique de fin de journee (${tz}, ${localTime}).`,
        });
        justClosedRegister = { id: todayReg.id, closingBalance: Number(todayReg.currentBalance) };
        closed += 1;
      }

      candidates.push({ agencyId: agency.id, dayStart: localDayStart, tz, localTime, justClosedRegister });
    }

    // Cloture des rapports du jour. Idempotent : un rapport deja CLOSED (ou
    // AMENDED) est saute -- a vide, ce passage ne coute qu'une requete.
    if (candidates.length > 0) {
      const existingReports = await prisma.agencyDailyReport.findMany({
        where: { OR: candidates.map((c) => ({ agencyId: c.agencyId, date: c.dayStart })) },
        select: { id: true, agencyId: true, status: true },
      });
      const reportByAgency = new Map(existingReports.map((r) => [r.agencyId, r]));

      for (const c of candidates) {
        const existing = reportByAgency.get(c.agencyId);
        const needsClosing = !existing || existing.status === 'GENERATED';
        if (needsClosing) {
          try {
            // Regeneration finale (fenetre bornee a la cloture) puis gel.
            const { id } = await this.reportService.generate(c.agencyId, c.dayStart);
            await prisma.agencyDailyReport.update({
              where: { id },
              data: { status: 'CLOSED', closedAt: new Date() },
            });
            reported += 1;
            reportsClosed += 1;
            logger.info({ agencyId: c.agencyId, localTime: c.localTime }, 'Rapport journalier cloture automatiquement');
          } catch (err) {
            // Best-effort : retente au prochain passage, mais TRACE l'echec
            // (un throw silencieux ici = rapport jamais cloture sans indice).
            logger.error({ err, agencyId: c.agencyId }, 'Cloture auto du rapport journalier echouee');
          }
        }
        // Event caisse APRES la cloture du rapport : le mail part avec le
        // snapshot final.
        if (c.justClosedRegister) {
          eventBus.emit({
            type: DomainEvents.CASH_REGISTER_CLOSED,
            payload: {
              registerId: c.justClosedRegister.id,
              agencyId: c.agencyId,
              closingBalance: c.justClosedRegister.closingBalance,
              auto: true,
            },
            timestamp: new Date(),
            userId: undefined,
          });
        }
      }
    }

    return { closed, checked: agencies.length, reported, reportsClosed };
  }
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
