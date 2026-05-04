import { injectable } from 'tsyringe';
import type { CreateAgencyChargeInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class CreateAgencyChargeUseCase {
  async execute(agencyId: string, input: CreateAgencyChargeInput) {
    const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) throw new NotFoundError('Agence', agencyId);

    return prisma.agencyCharge.create({
      data: {
        agencyId,
        type: input.type,
        label: input.label,
        defaultAmount: input.defaultAmount,
        dueDayOfMonth: input.dueDayOfMonth ?? null,
        reference: input.reference ?? null,
      },
    });
  }
}
