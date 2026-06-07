import { inject, injectable } from 'tsyringe';
import { TRANSIT_ROUTE_REPOSITORY, type ITransitRouteRepository } from '../../interfaces/ITransitRouteRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';
import { realtimeService } from '../../../infrastructure/realtime/RealtimeService';

@injectable()
export class DeleteTransitRouteUseCase {
  constructor(
    @inject(TRANSIT_ROUTE_REPOSITORY) private transitRepo: ITransitRouteRepository,
  ) {}

  async execute(id: string) {
    const route = await this.transitRepo.findById(id);
    if (!route) {
      throw new NotFoundError('Route de transit', id);
    }
    await this.transitRepo.delete(id);
    realtimeService.emitResourceChange(route.organizationId, 'transit-routes', 'deleted', id);
  }
}
