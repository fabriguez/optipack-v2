import { container } from '../../../container';
import { prisma } from '../../../config/database';
import { eventBus, DomainEvents, type DomainEvent } from '../EventBus';
import { SendDailyReportEmailUseCase } from '../../../application/use-cases/agency/SendDailyReportEmailUseCase';
import { createChildLogger } from '../../../config/logger';

const logger = createChildLogger('DailyReportEmailHandler');

/**
 * A la cloture d'une caisse (auto ou manuelle), envoie le rapport journalier
 * par mail aux destinataires resolus (chef agence, admins org, caissier).
 * Idempotent : si l'event est emit plusieurs fois, le mail est renvoye et
 * emailedAt mis a jour.
 */
export function registerDailyReportEmailHandler(): void {
  eventBus.on(DomainEvents.CASH_REGISTER_CLOSED, async (event: DomainEvent) => {
    const agencyId = event.payload.agencyId as string | undefined;
    const registerId = event.payload.registerId as string | undefined;
    if (!agencyId || !registerId) return;

    // Le rapport est genere par le UseCase (Close/AutoClose) en best-effort.
    // On le retrouve via la date de la caisse fermee.
    const register = await prisma.agencyCashRegister.findUnique({
      where: { id: registerId },
      select: { date: true },
    });
    if (!register) return;

    const dayStart = new Date(register.date);
    dayStart.setUTCHours(0, 0, 0, 0);

    const report = await prisma.agencyDailyReport.findUnique({
      where: { agencyId_date: { agencyId, date: dayStart } },
      select: { id: true },
    });
    if (!report) {
      logger.warn({ agencyId, registerId }, 'Rapport journalier introuvable, envoi mail saute');
      return;
    }

    try {
      const useCase = container.resolve(SendDailyReportEmailUseCase);
      const result = await useCase.execute(report.id);
      logger.info(
        { agencyId, reportId: report.id, sent: result.sent, recipients: result.recipients.length },
        'Rapport journalier envoye par mail',
      );
    } catch (err) {
      logger.error({ err, agencyId, reportId: report.id }, 'Echec envoi mail rapport journalier');
    }
  });
  logger.debug('DailyReportEmailHandler registered');
}
