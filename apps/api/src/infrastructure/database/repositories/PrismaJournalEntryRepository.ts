import { injectable } from 'tsyringe';
import type { JournalEntry, Prisma } from '@prisma/client';
import type { IJournalEntryRepository, JournalEntryWithLines } from '../../../application/interfaces/IJournalEntryRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

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
    filters: { agencyId?: string; sourceType?: string },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<JournalEntryWithLines>> {
    const { page, limit, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.JournalEntryWhereInput = {
      ...(filters.agencyId && { agencyId: filters.agencyId }),
      ...(filters.sourceType && { sourceType: filters.sourceType as any }),
      ...(search && {
        OR: [
          { reference: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: JOURNAL_INCLUDE,
      }),
      prisma.journalEntry.count({ where }),
    ]);

    return {
      data: data as JournalEntryWithLines[],
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
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
}
