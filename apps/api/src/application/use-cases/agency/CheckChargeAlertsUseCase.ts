import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { createChildLogger } from '../../../config/logger';

const logger = createChildLogger('CheckChargeAlertsUseCase');

/**
 * Verification quotidienne :
 *  - Pour chaque agence, on regarde les charges actives (non auto-managees ou auto)
 *    qui ont un dueDayOfMonth defini et n'ont pas encore ete payees pour la
 *    periode courante (YYYY-MM).
 *  - Si la date courante est dans les 3 jours avant l'echeance OU passee : on
 *    cree une notification IN_APP "rappel paiement" ciblant l'agence.
 *  - Si la somme des soldes des caisses de l'agence est inferieure aux montants
 *    dus a l'echeance, on cree une notification "fonds insuffisants".
 *
 * Idempotence : on regarde si une notification du meme type+payload existe deja
 * pour la periode -> on ne dedouble pas.
 */
@injectable()
export class CheckChargeAlertsUseCase {
  async execute(): Promise<{ remindersCreated: number; insufficientCreated: number }> {
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const today = now.getUTCDate();

    const agencies = await prisma.agency.findMany({
      where: { isActive: true },
      include: {
        charges: {
          where: { isActive: true },
          include: {
            expenses: { where: { period } },
          },
        },
      },
    });

    let remindersCreated = 0;
    let insufficientCreated = 0;

    for (const agency of agencies) {
      let totalDue = 0;
      const dueCharges: Array<{
        chargeId: string;
        label: string;
        type: string;
        defaultAmount: number;
        paidAmount: number;
        remaining: number;
        dueDayOfMonth: number | null;
      }> = [];

      for (const charge of agency.charges) {
        const paid = charge.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
        const expected = Number(charge.defaultAmount);
        const remaining = Math.max(0, expected - paid);
        if (remaining <= 0) continue;

        // Rappel envoye si :
        //  - dueDayOfMonth defini et today >= dueDayOfMonth - 3
        //  - OU dueDayOfMonth en retard
        if (charge.dueDayOfMonth) {
          if (today >= charge.dueDayOfMonth - 3) {
            const created = await this.upsertReminder(agency.id, charge.id, charge.label, period, remaining, charge.dueDayOfMonth);
            if (created) remindersCreated += 1;
          }
        }

        dueCharges.push({
          chargeId: charge.id,
          label: charge.label,
          type: charge.type,
          defaultAmount: expected,
          paidAmount: paid,
          remaining,
          dueDayOfMonth: charge.dueDayOfMonth,
        });
        totalDue += remaining;
      }

      if (totalDue <= 0) continue;

      // Solde des caisses de l'agence (somme des currentBalance des caisses non cloturees + closingBalance des cloturees)
      const cashRegisters = await prisma.agencyCashRegister.findMany({
        where: { agencyId: agency.id },
        orderBy: { date: 'desc' },
        take: 30,
      });
      let availableFunds = 0;
      // Solde courant = derniere caisse (open ou closed) > closingBalance ou currentBalance
      const latest = cashRegisters[0];
      if (latest) {
        availableFunds = latest.isClosed
          ? Number(latest.closingBalance ?? latest.currentBalance)
          : Number(latest.currentBalance);
      }

      if (availableFunds < totalDue) {
        const created = await this.upsertInsufficientFundsAlert(
          agency.id,
          agency.name,
          period,
          totalDue,
          availableFunds,
          dueCharges,
        );
        if (created) insufficientCreated += 1;
      }
    }

    logger.info({ remindersCreated, insufficientCreated }, 'Charge alerts processed');
    return { remindersCreated, insufficientCreated };
  }

  private async upsertReminder(
    agencyId: string,
    chargeId: string,
    label: string,
    period: string,
    remaining: number,
    dueDayOfMonth: number,
  ): Promise<boolean> {
    const tag = `charge-reminder:${chargeId}:${period}`;
    const existing = await prisma.notification.findFirst({
      where: { agencyId, metadata: { path: ['tag'], equals: tag } },
    });
    if (existing) return false;
    await prisma.notification.create({
      data: {
        agencyId,
        title: `Rappel : paiement charge "${label}"`,
        message: `La charge "${label}" est due le ${dueDayOfMonth} et n'a pas encore ete soldee. Reste a payer : ${remaining.toLocaleString()} FCFA.`,
        type: 'IN_APP',
        status: 'PENDING',
        metadata: { tag, chargeId, period, remaining } as any,
      },
    });
    return true;
  }

  private async upsertInsufficientFundsAlert(
    agencyId: string,
    agencyName: string,
    period: string,
    totalDue: number,
    availableFunds: number,
    dueCharges: any[],
  ): Promise<boolean> {
    const tag = `charge-insufficient:${agencyId}:${period}`;
    const existing = await prisma.notification.findFirst({
      where: { agencyId, metadata: { path: ['tag'], equals: tag } },
    });
    if (existing) return false;
    await prisma.notification.create({
      data: {
        agencyId,
        title: `Fonds insuffisants pour les charges (${period})`,
        message: `Agence "${agencyName}" : les charges dues s'elevent a ${totalDue.toLocaleString()} FCFA mais le solde caisse n'est que de ${availableFunds.toLocaleString()} FCFA.`,
        type: 'IN_APP',
        status: 'PENDING',
        metadata: { tag, period, totalDue, availableFunds, dueCharges } as any,
      },
    });
    return true;
  }
}
