import { injectable } from 'tsyringe';
import type { JournalEntry, Prisma } from '@prisma/client';
import type { IJournalEntryRepository, JournalEntryWithLines } from '../../../application/interfaces/IJournalEntryRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { dailyDateStr, maxSeqFromRefs } from './PrismaPaymentRepository';

const JOURNAL_INCLUDE = {
  lines: {
    include: {
      debitAccount: { select: { id: true, code: true, name: true } },
      creditAccount: { select: { id: true, code: true, name: true } },
    },
  },
  // Auteur de l'ecriture (visible dans la liste + detail). User a
  // firstName + lastName (pas fullName, qui est sur Client/Employee).
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
};

@injectable()
export class PrismaJournalEntryRepository implements IJournalEntryRepository {
  async findById(id: string): Promise<JournalEntryWithLines | null> {
    return prisma.journalEntry.findUnique({
      where: { id },
      include: JOURNAL_INCLUDE,
    }) as Promise<JournalEntryWithLines | null>;
  }

  async findAll(
    filters: {
      agencyId?: string;
      sourceType?: string;
      dateFrom?: string;
      dateTo?: string;
      scopeWhere?: object | null;
    },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<JournalEntryWithLines>> {
    const { page, limit, search } = pagination;
    const skip = (page - 1) * limit;

    // Plage de dates (JournalEntry.date). Attend 'YYYY-MM-DD'. dateTo inclusif.
    const gte = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00.000`) : undefined;
    const lte = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`) : undefined;
    const dateFilter = {
      ...(gte && !Number.isNaN(gte.getTime()) && { gte }),
      ...(lte && !Number.isNaN(lte.getTime()) && { lte }),
    };

    const where: Prisma.JournalEntryWhereInput = {
      ...(filters.agencyId && { agencyId: filters.agencyId }),
      ...(filters.sourceType && { sourceType: filters.sourceType as any }),
      ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      // Scope agence (etape 2) : merge en AND, ne touche pas au OR de recherche.
      ...(filters.scopeWhere && { AND: [filters.scopeWhere as Prisma.JournalEntryWhereInput] }),
      ...(search && {
        OR: [
          { reference: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total, totalsAgg] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: JOURNAL_INCLUDE,
      }),
      prisma.journalEntry.count({ where }),
      // Totaux debit/credit sur TOUT l'ensemble filtre (pas seulement la page),
      // pour le pied de page "totaux de la periode".
      prisma.journalEntryLine.aggregate({
        where: { journalEntry: where },
        _sum: { debitAmount: true, creditAmount: true },
      }),
    ]);

    return {
      data: data as JournalEntryWithLines[],
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totals: {
          debit: Number(totalsAgg._sum.debitAmount ?? 0),
          credit: Number(totalsAgg._sum.creditAmount ?? 0),
        },
      },
    } as PaginatedResponse<JournalEntryWithLines>;
  }

  async create(data: Prisma.JournalEntryCreateInput): Promise<JournalEntry> {
    return prisma.journalEntry.create({ data, include: JOURNAL_INCLUDE });
  }

  async countByDate(agencyId: string, date: Date): Promise<number> {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return prisma.journalEntry.count({
      where: { agencyId, date: { gte: start, lte: end } },
    });
  }

  /**
   * Max de la sequence des references `PREFIX-YYYYMMDD-NNNN` du jour, toutes
   * agences confondues (la reference journal est unique globalement). Evite les
   * collisions inter-agences/inter-flux dues a un compteur par-agence.
   */
  async maxDailySequence(prefix: string, date: Date): Promise<number> {
    const like = `${prefix}-${dailyDateStr(date)}-`;
    const rows = await prisma.journalEntry.findMany({
      where: { reference: { startsWith: like } },
      select: { reference: true },
    });
    return maxSeqFromRefs(rows.map((r) => r.reference), like);
  }
}
