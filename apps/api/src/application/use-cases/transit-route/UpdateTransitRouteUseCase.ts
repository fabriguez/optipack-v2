import { inject, injectable } from 'tsyringe';
import type { UpdateTransitRouteInput } from '@transitsoftservices/shared';
import { TRANSIT_ROUTE_REPOSITORY, type ITransitRouteRepository } from '../../interfaces/ITransitRouteRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';
import { realtimeService } from '../../../infrastructure/realtime/RealtimeService';

@injectable()
export class UpdateTransitRouteUseCase {
  constructor(
    @inject(TRANSIT_ROUTE_REPOSITORY) private transitRepo: ITransitRouteRepository,
  ) {}

  async execute(id: string, input: UpdateTransitRouteInput, organizationId: string) {
    const route = await this.transitRepo.findById(id);
    if (!route || route.organizationId !== organizationId) {
      throw new NotFoundError('Route de transit', id);
    }
    const updated = await this.transitRepo.update(id, input);
    realtimeService.emitResourceChange(route.organizationId, 'transit-routes', 'updated', id);
    return updated;
  }
}
