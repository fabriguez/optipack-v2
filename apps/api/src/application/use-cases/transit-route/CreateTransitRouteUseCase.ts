import { inject, injectable } from 'tsyringe';
import type { CreateTransitRouteInput } from '@transitsoftservices/shared';
import { TRANSIT_ROUTE_REPOSITORY, type ITransitRouteRepository } from '../../interfaces/ITransitRouteRepository';

@injectable()
export class CreateTransitRouteUseCase {
  constructor(
    @inject(TRANSIT_ROUTE_REPOSITORY) private transitRepo: ITransitRouteRepository,
  ) {}

  async execute(input: CreateTransitRouteInput, organizationId: string) {
    return this.transitRepo.create({
      name: input.name,
      type: input.type,
      departureCity: input.departureCity,
      departureCountry: input.departureCountry,
      arrivalCity: input.arrivalCity,
      arrivalCountry: input.arrivalCountry,
      pricePerKg: input.pricePerKg,
      pricePerVolume: input.pricePerVolume ?? 0,
      estimatedDurationDays: input.estimatedDurationDays ?? 0,
      organization: { connect: { id: organizationId } },
    });
  }
}
