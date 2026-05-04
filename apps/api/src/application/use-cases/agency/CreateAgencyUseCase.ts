import { inject, injectable } from 'tsyringe';
import type { CreateAgencyInput } from '@transitsoftservices/shared';
import { AGENCY_REPOSITORY, type IAgencyRepository } from '../../interfaces/IAgencyRepository';
import { ConflictError } from '../../../domain/errors/BusinessError';

@injectable()
export class CreateAgencyUseCase {
  constructor(
    @inject(AGENCY_REPOSITORY) private agencyRepo: IAgencyRepository,
  ) {}

  async execute(input: CreateAgencyInput, organizationId: string) {
    // Generate unique code from name
    const code = input.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 6);

    // Check uniqueness
    const existing = await this.agencyRepo.findByCode(code);
    if (existing) {
      const count = await this.agencyRepo.count(organizationId);
      const uniqueCode = `${code}${count + 1}`;
      return this.createAgency(input, organizationId, uniqueCode);
    }

    return this.createAgency(input, organizationId, code);
  }

  private async createAgency(input: CreateAgencyInput, organizationId: string, code: string) {
    return this.agencyRepo.create({
      name: input.name,
      code,
      address: input.address,
      city: input.city,
      country: input.country,
      phone: input.phone,
      email: input.email || null,
      imageUrl: input.imageUrl || null,
      googleMapsLink: input.googleMapsLink || null,
      organization: { connect: { id: organizationId } },
      ...(input.responsibleUserId && {
        responsibleUser: { connect: { id: input.responsibleUserId } },
      }),
    });
  }
}
