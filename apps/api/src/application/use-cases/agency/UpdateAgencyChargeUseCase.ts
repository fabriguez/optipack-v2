import { injectable } from 'tsyringe';
import type { UpdateAgencyChargeInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

@injectable()
export class UpdateAgencyChargeUseCase {
  async execute(chargeId: string, input: UpdateAgencyChargeInput) {
    const charge = await prisma.agencyCharge.findUnique({ where: { id: chargeId } });
    if (!charge) throw new NotFoundError('Charge', chargeId);

    if ((charge as any).isAutoManaged) {
      throw new BusinessError(
        'Cette charge est generee automatiquement (masse salariale). Modifiez les salaires des employes pour ajuster son montant.',
      );
    }
    if (input.type === 'SALARY') {
      throw new BusinessError(
        'Le type SALARY est reserve a la charge auto-geree de masse salariale.',
      );
    }

    return prisma.agencyCharge.update({
      where: { id: chargeId },
      data: {
        ...(input.type !== undefined && { type: input.type }),
        ...(input.label !== undefined && { label: input.label }),
        ...(input.defaultAmount !== undefined && { defaultAmount: input.defaultAmount }),
        ...(input.dueDayOfMonth !== undefined && { dueDayOfMonth: input.dueDayOfMonth ?? null }),
        ...(input.reference !== undefined && { reference: input.reference ?? null }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
  }
}
