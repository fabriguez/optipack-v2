import cron from 'node-cron';
import { container } from '../../container';
import { CalculatePenaltiesUseCase } from '../../application/use-cases/penalty/CalculatePenaltiesUseCase';
import { CoherenceService } from '../../application/services/CoherenceService';
import { AutoCloseCashRegistersUseCase } from '../../application/use-cases/cash-register/AutoCloseCashRegistersUseCase';
import { CheckChargeAlertsUseCase } from '../../application/use-cases/agency/CheckChargeAlertsUseCase';
import { AutoMarkAbsentUseCase } from '../../application/use-cases/employee/AutoMarkAbsentUseCase';
import { prisma } from '../../config/database';
import { eventBus, DomainEvents } from '../events/EventBus';
import { createChildLogger } from '../../config/logger';

const logger = createChildLogger('CronService');

export function startCronJobs(): void {
  // Calculate penalties every day at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running daily penalty calculation...');
    try {
      const useCase = container.resolve(CalculatePenaltiesUseCase);
      const result = await useCase.execute();
      logger.info(result, 'Penalty calculation completed');
    } catch (err) {
      logger.error({ err }, 'Penalty calculation failed');
    }
  });

  // Check debt due dates every day at 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    logger.info('Running daily debt alert check...');
    try {
      await checkDebtAlerts();
    } catch (err) {
      logger.error({ err }, 'Debt alert check failed');
    }
  });

  // Mark overdue debts every day at 1:00 AM
  cron.schedule('0 1 * * *', async () => {
    logger.info('Running overdue debt check...');
    try {
      await markOverdueDebts();
    } catch (err) {
      logger.error({ err }, 'Overdue debt check failed');
    }
  });

  // Relances quotidiennes dettes OVERDUE (multi-canal) chaque jour a 9h.
  // Anti-spam : 1 relance par jour max par dette (fenetre 24h via DebtHistory).
  cron.schedule('0 9 * * *', async () => {
    logger.info('Running overdue debt reminders...');
    try {
      await sendOverdueRemindersDaily();
    } catch (err) {
      logger.error({ err }, 'Overdue debt reminders failed');
    }
  });

  // #02 — Verification de coherence Parcel (warehouseId XOR containerId) toutes les 6h
  cron.schedule('0 */6 * * *', async () => {
    try {
      const svc = container.resolve(CoherenceService);
      const result = await svc.checkParcelLocations();
      if (result.bothSet > 0 || result.neitherSet > 0) {
        logger.warn(result, 'Parcel coherence violations detected');
      }
    } catch (err) {
      logger.error({ err }, 'Parcel coherence check failed');
    }
  });

  // Cloture automatique des caisses : toutes les 10 minutes, on regarde si l'heure
  // de fermeture configuree est passee dans le fuseau de l'agence ; si oui on ferme.
  cron.schedule('*/10 * * * *', async () => {
    try {
      const useCase = container.resolve(AutoCloseCashRegistersUseCase);
      const result = await useCase.execute();
      if (result.closed > 0) {
        logger.info(result, 'Cash registers auto-closed');
      }
    } catch (err) {
      logger.error({ err }, 'Auto cash register closing failed');
    }
  });

  // Auto-mark absent : 23:30 chaque jour, marque absent les employes
  // avec un shift planifie sans pointage.
  cron.schedule('30 23 * * *', async () => {
    try {
      const useCase = container.resolve(AutoMarkAbsentUseCase);
      const result = await useCase.execute();
      if (result.marked > 0) logger.info(result, 'Employees auto-marked absent');
    } catch (err) {
      logger.error({ err }, 'Auto-absent failed');
    }
  });

  // Verification des charges chaque jour a 7h : rappels de paiement + alerte fonds insuffisants.
  cron.schedule('0 7 * * *', async () => {
    try {
      const useCase = container.resolve(CheckChargeAlertsUseCase);
      const result = await useCase.execute();
      logger.info(result, 'Charge alerts processed');
    } catch (err) {
      logger.error({ err }, 'Charge alerts check failed');
    }
  });

  // Detection des retards : chaque jour a 6h, alerte les clients dont le colis
  // est encore en transit alors que l'ETA du conteneur est depassee.
  cron.schedule('0 6 * * *', async () => {
    logger.info('Running delayed-parcel detection...');
    try {
      const result = await detectDelayedParcels();
      if (result.notified > 0) logger.info(result, 'Delayed parcels notified');
    } catch (err) {
      logger.error({ err }, 'Delayed-parcel detection failed');
    }
  });

  logger.info(
    'Cron jobs scheduled: penalty (2AM), debt alerts (8AM), overdue debts (1AM), parcel coherence (every 6h), auto cash close (every 10min), charge alerts (7AM), delay detection (6AM)',
  );
}

/**
 * Detecte les colis en retard : encore IN_TRANSIT alors que la date d'arrivee
 * estimee de leur conteneur est passee (et le conteneur pas encore arrive).
 * Emet PARCEL_DELAYED une seule fois par colis (verrou via delayNotifiedAt).
 */
async function detectDelayedParcels(): Promise<{ scanned: number; notified: number }> {
  const now = new Date();
  const parcels = await prisma.parcel.findMany({
    where: {
      status: 'IN_TRANSIT',
      delayNotifiedAt: null,
      isDeleted: false,
      container: {
        actualArrivalDate: null,
        estimatedArrivalDate: { not: null, lt: now },
      },
    },
    select: {
      id: true,
      clientId: true,
      trackingNumber: true,
      designation: true,
      container: {
        select: {
          designation: true,
          estimatedArrivalDate: true,
          arrivalAgencyId: true,
          departureAgencyId: true,
        },
      },
    },
    take: 1000,
  });

  let notified = 0;
  for (const p of parcels) {
    if (!p.clientId) continue;
    eventBus.emit({
      type: DomainEvents.PARCEL_DELAYED,
      payload: {
        parcelId: p.id,
        clientId: p.clientId,
        trackingNumber: p.trackingNumber,
        designation: p.designation,
        agencyId: p.container?.arrivalAgencyId ?? p.container?.departureAgencyId,
        containerName: p.container?.designation,
        estimatedArrivalDate: p.container?.estimatedArrivalDate,
      },
      timestamp: new Date(),
    });
    await prisma.parcel.update({
      where: { id: p.id },
      data: { delayNotifiedAt: now },
    });
    notified++;
  }
  return { scanned: parcels.length, notified };
}

async function checkDebtAlerts(): Promise<void> {
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  // Find debts due within 3 days that haven't been alerted yet.
  // Multi-canal : IN_APP toujours + EMAIL + SMS + WHATSAPP (les externes
  // sont SKIPPED si pas de provider configure). Priorite CRITICAL force
  // tous les canaux. Pour les autres, IN_APP + EMAIL suffisent.
  const debts = await prisma.debt.findMany({
    where: {
      type: 'CLIENT',
      clientId: { not: null },
      status: { in: ['ACTIVE', 'PARTIALLY_PAID'] },
      alertSent: false,
      nextDueDate: { lte: threeDaysFromNow, gte: new Date() },
    },
    include: {
      client: { select: { id: true, fullName: true, phone: true, email: true } },
      invoice: { select: { id: true, reference: true } },
      agency: { select: { id: true } },
    },
  });

  const { notificationService } = await import('../../application/services/notifications/NotificationService');

  let alerted = 0;
  for (const debt of debts) {
    const channels = debt.priority === 'CRITICAL'
      ? (['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'] as const)
      : (['IN_APP', 'EMAIL', 'WHATSAPP'] as const);
    const dueDate = debt.nextDueDate?.toLocaleDateString('fr-FR') ?? '-';
    const amount = Number(debt.remainingAmount).toLocaleString();
    try {
      await notificationService.notify(
        { clientId: debt.clientId!, agencyId: debt.agencyId },
        {
          title: 'Echeance de dette proche',
          message: `Bonjour ${debt.client?.fullName ?? ''}, votre echeance de ${amount} FCFA arrive le ${dueDate}. Reference ${debt.reference}${debt.invoice?.reference ? ` (facture ${debt.invoice.reference})` : ''}.`,
          channels: channels as any,
          metadata: { debtId: debt.id, invoiceId: debt.invoiceId, kind: 'DEBT_DUE_SOON' },
        },
      );
      await prisma.debt.update({ where: { id: debt.id }, data: { alertSent: true } });
      alerted++;
    } catch (err) {
      logger.error({ err, debtId: debt.id }, 'Debt alert dispatch failed');
    }
  }

  logger.info({ alerted, total: debts.length }, 'Debt alerts processed');
}

/**
 * Relance quotidienne dettes OVERDUE : multi-canal (IN_APP + EMAIL + SMS
 * + WHATSAPP). On cible les dettes OVERDUE non-soldees. Anti-spam : flag
 * lastReminderAt non persiste -- on espace via une fenetre 24h via
 * verification dans DebtHistory (entree REMINDER_SENT < 24h => skip).
 */
async function sendOverdueRemindersDaily(): Promise<void> {
  const debts = await prisma.debt.findMany({
    where: {
      type: 'CLIENT',
      clientId: { not: null },
      status: 'OVERDUE',
    },
    include: {
      client: { select: { id: true, fullName: true } },
      agency: { select: { id: true } },
    },
  });

  const { notificationService } = await import('../../application/services/notifications/NotificationService');
  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;
  let sent = 0;

  for (const debt of debts) {
    // Anti-spam : skip si une relance a deja ete envoyee dans les 24h.
    const lastReminder = await prisma.debtHistory.findFirst({
      where: { debtId: debt.id, action: 'REMINDER_SENT' },
      orderBy: { createdAt: 'desc' },
    });
    if (lastReminder && now.getTime() - lastReminder.createdAt.getTime() < oneDayMs) {
      continue;
    }

    const amount = Number(debt.remainingAmount).toLocaleString();
    try {
      await notificationService.notify(
        { clientId: debt.clientId!, agencyId: debt.agencyId },
        {
          title: 'Dette en retard',
          message: `Bonjour ${debt.client?.fullName ?? ''}, votre dette ${debt.reference} d'un montant de ${amount} FCFA est en retard. Merci de regulariser au plus vite.`,
          channels: ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'] as any,
          metadata: { debtId: debt.id, kind: 'DEBT_OVERDUE_REMINDER' },
        },
      );
      await prisma.debtHistory.create({
        data: {
          debtId: debt.id,
          action: 'REMINDER_SENT',
          changes: { kind: 'OVERDUE', priority: debt.priority } as any,
          comment: 'Relance automatique envoyee (multi-canal).',
          userId: null,
        },
      });
      sent++;
    } catch (err) {
      logger.error({ err, debtId: debt.id }, 'Overdue reminder dispatch failed');
    }
  }
  logger.info({ sent, total: debts.length }, 'Overdue debt reminders processed');
}

async function markOverdueDebts(): Promise<void> {
  const result = await prisma.debt.updateMany({
    where: {
      status: { in: ['ACTIVE', 'PARTIALLY_PAID'] },
      nextDueDate: { lt: new Date() },
    },
    data: {
      status: 'OVERDUE',
    },
  });

  if (result.count > 0) {
    logger.info({ count: result.count }, 'Debts marked as overdue');
  }
}
