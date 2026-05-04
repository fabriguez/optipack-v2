import { injectable } from 'tsyringe';
import type { AgencyCashRegister, Prisma } from '@prisma/client';
import type { ICashRegisterRepository } from '../../../application/interfaces/ICashRegisterRepository';
import { prisma } from '../../../config/database';

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
    // Si la caisse du jour est cloturee, on bascule sur le prochain jour ouvrable.
    // Cela permet d'enregistrer une entree/sortie apres fermeture sans casser
    // l'integrite financiere du jour ferme (chiffres deja gravels).
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRegister = await this.findOpenByAgency(agencyId, today);
    if (todayRegister && !todayRegister.isClosed) return todayRegister;

    if (todayRegister?.isClosed) {
      // Bascule sur la caisse du prochain jour ouvrable (en pratique, demain)
      const nextDate = await this.computeNextBusinessDay(agencyId, today);
      return this.openOrGetForDate(agencyId, nextDate);
    }

    return this.openOrGetForDate(agencyId, today);
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
    return prisma.agencyCashRegister.update({
      where: { id },
      data: {
        totalEntries: { increment: amount },
        currentBalance: { increment: amount },
      },
    });
  }

  async addExit(id: string, amount: number): Promise<AgencyCashRegister> {
    return prisma.agencyCashRegister.update({
      where: { id },
      data: {
        totalExits: { increment: amount },
        currentBalance: { decrement: amount },
      },
    });
  }
}
