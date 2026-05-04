import cron from 'node-cron';
import { container } from '../../container';
import { CalculatePenaltiesUseCase } from '../../application/use-cases/penalty/CalculatePenaltiesUseCase';
import { CoherenceService } from '../../application/services/CoherenceService';
import { AutoCloseCashRegistersUseCase } from '../../application/use-cases/cash-register/AutoCloseCashRegistersUseCase';
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

  logger.info(
    'Cron jobs scheduled: penalty (2AM), debt alerts (8AM), overdue debts (1AM), parcel coherence (every 6h), auto cash close (every 10min)',
  );
}

async function checkDebtAlerts(): Promise<void> {
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  // Find debts due within 3 days that haven't been alerted yet
  const debts = await prisma.debt.findMany({
    where: {
      status: { in: ['ACTIVE', 'PARTIALLY_PAID'] },
      alertSent: false,
      nextDueDate: { lte: threeDaysFromNow, gte: new Date() },
    },
    include: {
      client: { select: { id: true, fullName: true, phone: true, email: true } },
      invoice: { select: { id: true, reference: true } },
    },
  });

  let alerted = 0;
  for (const debt of debts) {
    // Create notification for the client
    await prisma.notification.create({
      data: {
        clientId: debt.clientId,
        title: 'Echeance de dette proche',
        message: `Votre echeance de ${Number(debt.remainingAmount).toLocaleString()} FCFA arrive le ${debt.nextDueDate?.toLocaleDateString('fr-FR')}. Facture: ${debt.invoice?.reference || '-'}`,
        type: 'IN_APP',
        status: 'PENDING',
        metadata: { debtId: debt.id, invoiceId: debt.invoiceId },
      },
    });

    // Mark alert as sent
    await prisma.debt.update({
      where: { id: debt.id },
      data: { alertSent: true },
    });

    alerted++;
  }

  logger.info({ alerted, total: debts.length }, 'Debt alerts processed');
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
