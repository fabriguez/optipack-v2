import type { JournalEntry, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface JournalEntryWithLines extends JournalEntry {
  lines?: {
    id: string;
    debitAmount: any;
    creditAmount: any;
    description: string | null;
    debitAccount?: { id: string; code: string; name: string } | null;
    creditAccount?: { id: string; code: string; name: string } | null;
  }[];
}

export interface IJournalEntryRepository {
  findById(id: string): Promise<JournalEntryWithLines | null>;
  findAll(
    filters: { agencyId?: string; sourceType?: string; scopeWhere?: object | null },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<JournalEntryWithLines>>;
  create(data: Prisma.JournalEntryCreateInput): Promise<JournalEntry>;
  countByDate(agencyId: string, date: Date): Promise<number>;
  /** Max sequence des references PREFIX-YYYYMMDD-NNNN du jour (global, anti-collision). */
  maxDailySequence(prefix: string, date: Date): Promise<number>;
}

export const JOURNAL_ENTRY_REPOSITORY = Symbol.for('IJournalEntryRepository');
