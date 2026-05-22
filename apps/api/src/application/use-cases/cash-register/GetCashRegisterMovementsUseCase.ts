import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

export type CashMovementType =
  | 'PAYMENT'
  | 'EXPENSE'
  | 'DISBURSEMENT'
  | 'DEBT_PAYMENT'
  | 'FUND_TRANSFER_OUT'
  | 'FUND_TRANSFER_IN';

export interface CashMovement {
  id: string;
  type: CashMovementType;
  direction: 'IN' | 'OUT';
  amount: number;
  date: Date;
  label: string;
  reference?: string | null;
  userName?: string | null;
  voided?: boolean;
}

/**
 * Historique detaille des entrees / sorties d'une caisse agence pour une
 * journee donnee. Aucune table unique n'agrege les mouvements : on consolide
 * depuis chaque source qui touche la caisse.
 *
 *  - Entrees  : Payments (encaissements clients), DebtPayment de dette CLIENT,
 *               transferts de fonds recus.
 *  - Sorties  : Expenses (salaires, charges, depenses conteneur),
 *               DisbursementVoucher, DebtPayment de dettes PERSONNEL/AGENCY/
 *               CARRIER, transferts de fonds emis.
 */
@injectable()
export class GetCashRegisterMovementsUseCase {
  async execute(input: { agencyId?: string; cashRegisterId?: string }) {
    const register = input.cashRegisterId
      ? await prisma.agencyCashRegister.findUnique({ where: { id: input.cashRegisterId } })
      : input.agencyId
        ? await prisma.agencyCashRegister.findFirst({
            where: { agencyId: input.agencyId },
            orderBy: { date: 'desc' },
          })
        : null;
    if (!register) throw new NotFoundError('Caisse', input.cashRegisterId ?? input.agencyId ?? '');

    // Fenetre journee de la caisse (date @db.Date -> 00:00). On borne aussi
    // sur closedAt si la caisse est fermee.
    const dayStart = new Date(register.date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const windowEnd = register.closedAt && register.closedAt < dayEnd ? register.closedAt : dayEnd;
    const window = { gte: dayStart, lt: windowEnd };

    const [payments, expenses, disbursements, debtPayments, transfersOut, transfersIn] =
      await Promise.all([
        prisma.payment.findMany({
          where: { agencyId: register.agencyId, createdAt: window },
          include: {
            invoice: { select: { reference: true } },
            receivedBy: { select: { firstName: true, lastName: true } },
          },
        }),
        prisma.expense.findMany({
          // Exclut les depenses de salaire (category SALARY) : les versements
          // de paie sont suivis dans le module RH, pas dans l'historique caisse.
          where: { cashRegisterId: register.id, category: { not: 'SALARY' } },
          include: { approvedBy: { select: { firstName: true, lastName: true } } },
        }),
        prisma.disbursementVoucher.findMany({
          where: { cashRegisterId: register.id },
          include: { issuedBy: { select: { firstName: true, lastName: true } } },
        }),
        prisma.debtPayment.findMany({
          where: { cashRegisterId: register.id },
          include: {
            debt: { select: { type: true, reference: true } },
            receivedBy: { select: { firstName: true, lastName: true } },
          },
        }),
        prisma.fundTransfer.findMany({
          where: { sourceAgencyId: register.agencyId, createdAt: window },
          include: { initiatedBy: { select: { firstName: true, lastName: true } } },
        }),
        prisma.fundTransfer.findMany({
          where: { destinationAgencyId: register.agencyId, status: 'CONFIRMED', createdAt: window },
          include: { initiatedBy: { select: { firstName: true, lastName: true } } },
        }),
      ]);

    const name = (u: { firstName: string | null; lastName: string | null } | null | undefined) =>
      u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : null;

    const movements: CashMovement[] = [];

    for (const p of payments) {
      movements.push({
        id: `pay-${p.id}`,
        type: 'PAYMENT',
        direction: 'IN',
        amount: Number(p.amount),
        date: p.createdAt,
        label: `Encaissement facture ${p.invoice?.reference ?? ''}`.trim(),
        reference: p.reference,
        userName: name(p.receivedBy),
        voided: p.isVoided,
      });
    }
    for (const e of expenses) {
      movements.push({
        id: `exp-${e.id}`,
        type: 'EXPENSE',
        direction: 'OUT',
        amount: Number(e.amount),
        date: e.createdAt,
        label: e.title,
        reference: e.category ?? null,
        userName: name(e.approvedBy),
      });
    }
    for (const d of disbursements) {
      movements.push({
        id: `dec-${d.id}`,
        type: 'DISBURSEMENT',
        direction: d.isVoided ? 'IN' : 'OUT',
        amount: Number(d.amount),
        date: d.createdAt,
        label: `${d.isVoided ? 'Annulation decaissement' : 'Decaissement'} - ${d.reason}`,
        reference: d.reference,
        userName: name(d.issuedBy),
        voided: d.isVoided,
      });
    }
    for (const dp of debtPayments) {
      const isClient = dp.debt.type === 'CLIENT';
      movements.push({
        id: `debt-${dp.id}`,
        type: 'DEBT_PAYMENT',
        direction: isClient ? 'IN' : 'OUT',
        amount: Number(dp.amount),
        date: dp.createdAt,
        label: `${isClient ? 'Encaissement' : 'Reglement'} dette ${dp.debt.type.toLowerCase()}`,
        reference: dp.reference ?? dp.debt.reference,
        userName: name(dp.receivedBy),
        voided: dp.isVoided,
      });
    }
    for (const t of transfersOut) {
      movements.push({
        id: `ft-out-${t.id}`,
        type: 'FUND_TRANSFER_OUT',
        direction: 'OUT',
        amount: Number(t.amount),
        date: t.createdAt,
        label: `Transfert de fonds emis (${t.destinationType})`,
        reference: t.reference,
        userName: name(t.initiatedBy),
        voided: t.isVoided,
      });
    }
    for (const t of transfersIn) {
      movements.push({
        id: `ft-in-${t.id}`,
        type: 'FUND_TRANSFER_IN',
        direction: 'IN',
        amount: Number(t.amount),
        date: t.createdAt,
        label: 'Transfert de fonds recu',
        reference: t.reference,
        userName: name(t.initiatedBy),
        voided: t.isVoided,
      });
    }

    movements.sort((a, b) => b.date.getTime() - a.date.getTime());

    const totalIn = movements.filter((m) => m.direction === 'IN' && !m.voided).reduce((s, m) => s + m.amount, 0);
    const totalOut = movements.filter((m) => m.direction === 'OUT' && !m.voided).reduce((s, m) => s + m.amount, 0);

    return {
      cashRegister: {
        id: register.id,
        date: register.date,
        openingBalance: Number(register.openingBalance),
        totalEntries: Number(register.totalEntries),
        totalExits: Number(register.totalExits),
        currentBalance: Number(register.currentBalance),
        isClosed: register.isClosed,
      },
      movements,
      summary: { totalIn, totalOut, count: movements.length },
    };
  }
}
