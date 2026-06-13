import { inject, injectable } from 'tsyringe';
import type { PaginationInput } from '@transitsoftservices/shared';
import { CLIENT_REPOSITORY, type IClientRepository } from '../../interfaces/IClientRepository';

@injectable()
export class ListClientsUseCase {
  constructor(
    @inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
  ) {}

  async execute(
    filters: { organizationId?: string; agencyId?: string; scopeWhere?: object | null },
    pagination: PaginationInput,
  ) {
    return this.clientRepo.findAll(filters, pagination);
  }
}
