import { inject, injectable } from 'tsyringe';
import type { PaginationInput } from '@transitsoftservices/shared';
import { TRANSIT_ROUTE_REPOSITORY, type ITransitRouteRepository } from '../../interfaces/ITransitRouteRepository';

@injectable()
export class ListTransitRoutesUseCase {
  constructor(
    @inject(TRANSIT_ROUTE_REPOSITORY) private transitRepo: ITransitRouteRepository,
  ) {}

  async execute(organizationId: string, pagination: PaginationInput, filters?: { type?: string }) {
    return this.transitRepo.findAll(organizationId, pagination, filters);
  }
}
