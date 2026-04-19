import { inject, injectable } from 'tsyringe';
import type { UpdateTransitRouteInput } from '@transitsoftservices/shared';
import { TRANSIT_ROUTE_REPOSITORY, type ITransitRouteRepository } from '../../interfaces/ITransitRouteRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class UpdateTransitRouteUseCase {
  constructor(
    @inject(TRANSIT_ROUTE_REPOSITORY) private transitRepo: ITransitRouteRepository,
  ) {}

  async execute(id: string, input: UpdateTransitRouteInput) {
    const route = await this.transitRepo.findById(id);
    if (!route) {
      throw new NotFoundError('Route de transit', id);
    }
    return this.transitRepo.update(id, input);
  }
}
