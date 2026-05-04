import { injectable } from 'tsyringe';
import type { CreateAgencyChargeInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

@injectable()
export class CreateAgencyChargeUseCase {
  async execute(agencyId: string, input: CreateAgencyChargeInput) {
    const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) throw new NotFoundError('Agence', agencyId);

    // SALARY est gere automatiquement (PayrollChargeService) : pas de creation manuelle.
    if (input.type === 'SALARY') {
      throw new BusinessError(
        'La masse salariale est generee automatiquement a partir des employes ; impossible de la creer manuellement.',
      );
    }

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
