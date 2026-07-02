import { injectable } from 'tsyringe';
import type { UpdateAgencyChargeInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

@injectable()
export class UpdateAgencyChargeUseCase {
  async execute(chargeId: string, input: UpdateAgencyChargeInput, organizationId: string) {
    const charge = await prisma.agencyCharge.findUnique({
      where: { id: chargeId },
      include: { agency: { select: { organizationId: true } } },
    });
    if (!charge || charge.agency.organizationId !== organizationId) {
      throw new NotFoundError('Charge', chargeId);
    }

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

    const before = {
      type: charge.type,
      label: charge.label,
      defaultAmount: Number(charge.defaultAmount),
      dueDayOfMonth: charge.dueDayOfMonth,
      reference: charge.reference,
      isActive: charge.isActive,
      isAmountFlexible: (charge as any).isAmountFlexible,
    };

    const updated = await prisma.agencyCharge.update({
      where: { id: chargeId },
      data: {
        ...(input.type !== undefined && { type: input.type }),
        ...(input.label !== undefined && { label: input.label }),
        ...(input.defaultAmount !== undefined && { defaultAmount: input.defaultAmount }),
        ...(input.dueDayOfMonth !== undefined && { dueDayOfMonth: input.dueDayOfMonth ?? null }),
        ...(input.reference !== undefined && { reference: input.reference ?? null }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...((input as any).isAmountFlexible !== undefined && { isAmountFlexible: !!(input as any).isAmountFlexible }),
      },
    });

    const after = {
      type: updated.type,
      label: updated.label,
      defaultAmount: Number(updated.defaultAmount),
      dueDayOfMonth: updated.dueDayOfMonth,
      reference: updated.reference,
      isActive: updated.isActive,
      isAmountFlexible: (updated as any).isAmountFlexible,
    };

    const action = before.isActive !== after.isActive
      ? after.isActive ? 'REACTIVATED' : 'DEACTIVATED'
      : 'UPDATED';

    await prisma.agencyChargeHistory.create({
      data: {
        chargeId,
        action,
        changes: { before, after } as any,
      },
    });

    return updated;
  }
}
