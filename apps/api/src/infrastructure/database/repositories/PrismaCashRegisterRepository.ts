import { injectable } from 'tsyringe';
import type { AgencyCashRegister, Prisma } from '@prisma/client';
import type { ICashRegisterRepository } from '../../../application/interfaces/ICashRegisterRepository';
import { prisma } from '../../../config/database';
import { eventBus, DomainEvents } from '../../events/EventBus';

@injectable()
export class PrismaCashRegisterRepository implements ICashRegisterRepository {
  async findById(id: string): Promise<AgencyCashRegister | null> {
    return prisma.agencyCashRegister.findUnique({ where: { id } });
  }

  async findOpenByAgency(agencyId: string, date: Date): Promise<AgencyCashRegister | null> {
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    return prisma.agencyCashRegister.findUnique({
      where: { agencyId_date: { agencyId, date: dateOnly } },
    });
  }

  async findOrCreateForToday(agencyId: string): Promise<AgencyCashRegister> {
    // Si la caisse du jour est cloturee OU si aujourd'hui n'est pas un jour
    // ouvrable de l'agence, on bascule sur le prochain jour ouvrable. Cela
    // garantit que toute action post-fermeture (incl. week-end) atterrit
    // dans le rapport du prochain jour d'ouverture.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRegister = await this.findOpenByAgency(agencyId, today);
    if (todayRegister && !todayRegister.isClosed) return todayRegister;

    if (todayRegister?.isClosed) {
      const nextDate = await this.computeNextBusinessDay(agencyId, today);
      return this.openOrGetForDate(agencyId, nextDate);
    }

    // Aucune caisse pour aujourd'hui. Si aujourd'hui n'est pas un jour
    // d'ouverture configure -> snap au prochain jour ouvrable. Sinon ouvre
    // pour aujourd'hui.
    const openDay = await this.isAgencyOpenOn(agencyId, today);
    if (!openDay) {
      const nextDate = await this.computeNextBusinessDay(agencyId, today);
      return this.openOrGetForDate(agencyId, nextDate);
    }
    return this.openOrGetForDate(agencyId, today);
  }

  /** Verifie si la date donnee correspond a un jour d'ouverture configure
   *  pour l'agence (AgencyOpeningHours avec isOpen=true). Si aucune config :
   *  on considere tous les jours comme ouverts (compat ascendante). */
  private async isAgencyOpenOn(agencyId: string, date: Date): Promise<boolean> {
    const hours = await prisma.agencyOpeningHours.findMany({
      where: { agencyId, isOpen: true },
      select: { dayOfWeek: true },
    });
    if (hours.length === 0) return true;
    const dow = date.getDay();
    return hours.some((h) => h.dayOfWeek === dow);
  }

  /**
   * Cree (ou retourne) la caisse pour une date donnee, en reportant le solde
   * de cloture de la caisse precedente comme solde d'ouverture.
   */
  private async openOrGetForDate(agencyId: string, date: Date): Promise<AgencyCashRegister> {
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    const existing = await this.findOpenByAgency(agencyId, dateOnly);
    if (existing) return existing;

    // Solde d'ouverture = solde de cloture de la derniere caisse fermee anterieure
    const previous = await prisma.agencyCashRegister.findFirst({
      where: { agencyId, date: { lt: dateOnly } },
      orderBy: { date: 'desc' },
    });
    const openingBalance = previous?.closingBalance ?? previous?.currentBalance ?? 0;

    return prisma.agencyCashRegister.create({
      data: {
        agency: { connect: { id: agencyId } },
        date: dateOnly,
        openingBalance: Number(openingBalance),
        currentBalance: Number(openingBalance),
      },
    });
  }

  /**
   * Calcule la date du prochain jour ouvrable pour une agence en se basant sur
   * AgencyOpeningHours. Si aucune configuration : fallback = J+1.
   */
  private async computeNextBusinessDay(agencyId: string, fromDate: Date): Promise<Date> {
    const hours = await prisma.agencyOpeningHours.findMany({
      where: { agencyId, isOpen: true },
      select: { dayOfWeek: true },
    });
    const openDays = new Set(hours.map((h) => h.dayOfWeek));

    const candidate = new Date(fromDate);
    candidate.setHours(0, 0, 0, 0);
    for (let i = 1; i <= 7; i++) {
      candidate.setDate(candidate.getDate() + 1);
      if (openDays.size === 0 || openDays.has(candidate.getDay())) {
        return candidate;
      }
    }
    // Defensive fallback : J+1
    const fallback = new Date(fromDate);
    fallback.setDate(fallback.getDate() + 1);
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }

  async create(data: Prisma.AgencyCashRegisterCreateInput): Promise<AgencyCashRegister> {
    return prisma.agencyCashRegister.create({ data });
  }

  async update(id: string, data: Prisma.AgencyCashRegisterUpdateInput): Promise<AgencyCashRegister> {
    return prisma.agencyCashRegister.update({ where: { id }, data });
  }

  async addEntry(id: string, amount: number): Promise<AgencyCashRegister> {
    const updated = await prisma.agencyCashRegister.update({
      where: { id },
      data: {
        totalEntries: { increment: amount },
        currentBalance: { increment: amount },
      },
    });
    emitCashRegisterUpdated(updated);
    return updated;
  }

  async addExit(id: string, amount: number): Promise<AgencyCashRegister> {
    const updated = await prisma.agencyCashRegister.update({
      where: { id },
      data: {
        totalExits: { increment: amount },
        currentBalance: { decrement: amount },
      },
    });
    emitCashRegisterUpdated(updated);
    return updated;
  }
}

/** Emet un event domain pour declencher la regen du rapport journalier
 *  associe (cf DailyReportRegenHandler). Permet aux actions effectuees
 *  apres fermeture de l'agence (qui debitent/creditent la caisse du jour
 *  ouvrable suivant) de s'afficher des le mouvement dans le rapport du
 *  jour correspondant. */
function emitCashRegisterUpdated(register: AgencyCashRegister): void {
  try {
    eventBus.emit({
      type: DomainEvents.CASH_REGISTER_UPDATED,
      payload: {
        registerId: register.id,
        agencyId: register.agencyId,
        date: register.date.toISOString(),
      },
      timestamp: new Date(),
    });
  } catch {
    // non bloquant
  }
}
