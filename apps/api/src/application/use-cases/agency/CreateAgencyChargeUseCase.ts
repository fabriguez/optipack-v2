import { injectable } from 'tsyringe';
import type { CreateAgencyChargeInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

interface CreateInput extends CreateAgencyChargeInput {
  isAmountFlexible?: boolean;
  // Documents deja uploades (URLs renvoyees par /uploads/image ou similaire)
  documents?: Array<{ url: string; storageKey?: string; fileName?: string; contentType?: string; size?: number; caption?: string }>;
}

@injectable()
export class CreateAgencyChargeUseCase {
  async execute(agencyId: string, input: CreateInput, userId: string | undefined, organizationId: string) {
    const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency || agency.organizationId !== organizationId) {
      throw new NotFoundError('Agence', agencyId);
    }

    // SALARY est gere automatiquement (PayrollChargeService) : pas de creation manuelle.
    if (input.type === 'SALARY') {
      throw new BusinessError(
        'La masse salariale est generee automatiquement a partir des employes ; impossible de la creer manuellement.',
      );
    }

    return prisma.$transaction(async (tx) => {
      const charge = await tx.agencyCharge.create({
        data: {
          agencyId,
          type: input.type,
          label: input.label,
          defaultAmount: input.defaultAmount,
          dueDayOfMonth: input.dueDayOfMonth ?? null,
          reference: input.reference ?? null,
          isAmountFlexible: !!input.isAmountFlexible,
        },
      });

      if (input.documents?.length) {
        await tx.agencyChargeDocument.createMany({
          data: input.documents.map((d) => ({
            chargeId: charge.id,
            url: d.url,
            storageKey: d.storageKey ?? null,
            fileName: d.fileName ?? null,
            contentType: d.contentType ?? null,
            size: d.size ?? null,
            caption: d.caption ?? null,
            uploadedBy: userId ?? null,
          })),
        });
      }

      await tx.agencyChargeHistory.create({
        data: {
          chargeId: charge.id,
          action: 'CREATED',
          userId: userId ?? null,
          changes: {
            label: input.label,
            type: input.type,
            defaultAmount: input.defaultAmount,
            dueDayOfMonth: input.dueDayOfMonth ?? null,
            isAmountFlexible: !!input.isAmountFlexible,
            documents: input.documents?.length ?? 0,
          },
        },
      });

      return charge;
    });
  }
}
