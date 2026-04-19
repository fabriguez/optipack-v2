import { inject, injectable } from 'tsyringe';
import type { PaginationInput } from '@transitsoftservices/shared';
import { JOURNAL_ENTRY_REPOSITORY, type IJournalEntryRepository } from '../../interfaces/IJournalEntryRepository';

@injectable()
export class GetLedgerUseCase {
  constructor(
    @inject(JOURNAL_ENTRY_REPOSITORY) private journalRepo: IJournalEntryRepository,
  ) {}

  async execute(
    filters: { agencyId?: string; sourceType?: string },
    pagination: PaginationInput,
  ) {
    return this.journalRepo.findAll(filters, pagination);
  }
}
