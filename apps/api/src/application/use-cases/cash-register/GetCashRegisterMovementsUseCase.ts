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
  /** Vue "toutes caisses confondues" pour l'agence : agrege payments,
   *  expenses, disbursements, debtPayments, transferts -- sans filtre de
   *  session caisse. */
  async executeAll(agencyId: string, pageInput?: number, limitInput?: number) {
    const [payments, expenses, disbursements, debtPayments, transfersOut, transfersIn] =
      await Promise.all([
        prisma.payment.findMany({
          where: { agencyId },
          include: {
            invoice: { select: { reference: true } },
            receivedBy: { select: { firstName: true, lastName: true } },
          },
        }),
        prisma.expense.findMany({
          where: {
            agencyId,
            category: { not: 'SALARY' },
            disbursementId: null,
            cashRegisterId: { not: null },
          },
          include: { approvedBy: { select: { firstName: true, lastName: true } } },
        }),
        prisma.disbursementVoucher.findMany({
          where: { agencyId },
          include: { issuedBy: { select: { firstName: true, lastName: true } } },
        }),
        prisma.debtPayment.findMany({
          where: { agencyId, cashRegisterId: { not: null } },
          include: {
            debt: { select: { type: true, reference: true } },
            receivedBy: { select: { firstName: true, lastName: true } },
          },
        }),
        prisma.fundTransfer.findMany({
          where: { sourceAgencyId: agencyId },
          include: { initiatedBy: { select: { firstName: true, lastName: true } } },
        }),
        prisma.fundTransfer.findMany({
          where: { destinationAgencyId: agencyId, status: 'CONFIRMED' },
          include: { initiatedBy: { select: { firstName: true, lastName: true } } },
        }),
      ]);

    const name = (u: { firstName: string | null; lastName: string | null } | null | undefined) =>
      u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : null;
    const movements: CashMovement[] = [];
    for (const p of payments) {
      movements.push({
        id: `pay-${p.id}`, type: 'PAYMENT', direction: 'IN', amount: Number(p.amount),
        date: p.createdAt, label: `Encaissement facture ${p.invoice?.reference ?? ''}`.trim(),
        reference: p.reference, userName: name(p.receivedBy), voided: p.isVoided,
      });
    }
    for (const e of expenses) {
      movements.push({
        id: `exp-${e.id}`, type: 'EXPENSE', direction: 'OUT', amount: Number(e.amount),
        date: e.createdAt, label: e.title, reference: e.category ?? null, userName: name(e.approvedBy),
      });
    }
    for (const d of disbursements) {
      movements.push({
        id: `dec-${d.id}`, type: 'DISBURSEMENT',
        direction: d.isVoided ? 'IN' : 'OUT', amount: Number(d.amount), date: d.createdAt,
        label: `${d.isVoided ? 'Annulation decaissement' : 'Decaissement'} - ${d.reason}`,
        reference: d.reference, userName: name(d.issuedBy), voided: d.isVoided,
      });
    }
    for (const dp of debtPayments) {
      const isClient = dp.debt.type === 'CLIENT';
      movements.push({
        id: `debt-${dp.id}`, type: 'DEBT_PAYMENT', direction: isClient ? 'IN' : 'OUT',
        amount: Number(dp.amount), date: dp.createdAt,
        label: `${isClient ? 'Encaissement' : 'Reglement'} dette ${dp.debt.type.toLowerCase()}`,
        reference: dp.reference ?? dp.debt.reference, userName: name(dp.receivedBy), voided: dp.isVoided,
      });
    }
    for (const t of transfersOut) {
      movements.push({
        id: `ft-out-${t.id}`, type: 'FUND_TRANSFER_OUT', direction: 'OUT', amount: Number(t.amount),
        date: t.createdAt, label: `Transfert de fonds emis (${t.destinationType})`,
        reference: t.reference, userName: name(t.initiatedBy), voided: t.isVoided,
      });
    }
    for (const t of transfersIn) {
      movements.push({
        id: `ft-in-${t.id}`, type: 'FUND_TRANSFER_IN', direction: 'IN', amount: Number(t.amount),
        date: t.createdAt, label: 'Transfert de fonds recu',
        reference: t.reference, userName: name(t.initiatedBy), voided: t.isVoided,
      });
    }
    movements.sort((a, b) => b.date.getTime() - a.date.getTime());
    const totalIn = movements.filter((m) => m.direction === 'IN' && !m.voided).reduce((s, m) => s + m.amount, 0);
    const totalOut = movements.filter((m) => m.direction === 'OUT' && !m.voided).reduce((s, m) => s + m.amount, 0);
    const page = Math.max(1, Number(pageInput ?? 1));
    const limit = Math.max(1, Math.min(500, Number(limitInput ?? 100)));
    const total = movements.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    return {
      cashRegister: null,
      movements: movements.slice(start, start + limit),
      summary: { totalIn, totalOut, count: total },
      meta: { page, limit, total, totalPages, mode: 'all' as const },
    };
  }


  async execute(input: { agencyId?: string; cashRegisterId?: string; date?: string; all?: boolean; page?: number; limit?: number }) {
    // Mode "tous" : agrege les mouvements de TOUTES les caisses de l'agence,
    // toutes dates confondues. Pas de notion de session caisse.
    if (input.all && input.agencyId) {
      return this.executeAll(input.agencyId, input.page, input.limit);
    }

    // Resolution caisse :
    //  1. ID explicite
    //  2. Date specifique (date string YYYY-MM-DD) -> caisse de ce jour pour l'agence
    //  3. Sinon : caisse OUVERTE -> sinon plus recente
    let register = input.cashRegisterId
      ? await prisma.agencyCashRegister.findUnique({ where: { id: input.cashRegisterId } })
      : null;
    if (!register && input.agencyId && input.date) {
      const day = new Date(input.date);
      day.setUTCHours(0, 0, 0, 0);
      const next = new Date(day);
      next.setUTCDate(next.getUTCDate() + 1);
      register = await prisma.agencyCashRegister.findFirst({
        where: { agencyId: input.agencyId, date: { gte: day, lt: next } },
      });
    }
    if (!register && input.agencyId) {
      register =
        (await prisma.agencyCashRegister.findFirst({
          where: { agencyId: input.agencyId, isClosed: false },
          orderBy: { date: 'desc' },
        })) ??
        (await prisma.agencyCashRegister.findFirst({
          where: { agencyId: input.agencyId },
          orderBy: { date: 'desc' },
        }));
    }
    if (!register) throw new NotFoundError('Caisse', input.cashRegisterId ?? input.agencyId ?? '');

    // Fenetre = SESSION caisse (createdAt -> closedAt). Pas le jour calendaire :
    // une caisse ouverte le 24 a 22h pour le jour ouvrable du 25 doit voir les
    // paiements de 22h-minuit (createdAt=24/22h, mais session de la caisse 25).
    // Sinon les events post-cloture agence tombent hors window -> non affiches.
    const windowStart = register.createdAt;
    const windowEnd = register.closedAt ?? new Date();
    const window = { gte: windowStart, lt: windowEnd };

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
          // Exclut aussi les depenses ayant un disbursement lie (disbursementId
          // != null) : le mouvement caisse est porte par la ligne Disbursement,
          // l'Expense est juste un enregistrement metier (evite doublon).
          where: {
            cashRegisterId: register.id,
            category: { not: 'SALARY' },
            disbursementId: null,
          },
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

    // Totaux calcules sur TOUS les mouvements (pas seulement la page courante).
    const totalIn = movements.filter((m) => m.direction === 'IN' && !m.voided).reduce((s, m) => s + m.amount, 0);
    const totalOut = movements.filter((m) => m.direction === 'OUT' && !m.voided).reduce((s, m) => s + m.amount, 0);

    // Pagination cote applicatif (les sources sont heterogenes : impossible
    // de paginer en DB directement). Defaut : page=1, limit=100 (eviter de
    // donner l'impression que des mouvements sont absents quand la page 1 est
    // pleine ; utilisateur fait scroll/clic Suivant si besoin).
    const page = Math.max(1, Number(input.page ?? 1));
    const limit = Math.max(1, Math.min(500, Number(input.limit ?? 100)));
    const total = movements.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const pageItems = movements.slice(start, start + limit);

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
      movements: pageItems,
      summary: { totalIn, totalOut, count: total },
      meta: { page, limit, total, totalPages },
    };
  }
}
