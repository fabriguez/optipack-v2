/**
 * Attribution nominative d'un code promo a un ou plusieurs clients.
 *
 * L'attribution porte son propre quota (`maxUses`) : c'est ce qui permet a
 * l'admin de donner "3 usages" a un client et "1 usage" a un autre sur le meme
 * code. En l'absence de quota d'attribution, le code retombe sur son
 * `maxUsesPerClient` generique.
 */
import { injectable } from 'tsyringe';
import type { Prisma } from '@prisma/client';
import type { AssignPromoCodeInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

async function assertPromoInOrg(organizationId: string, promoCodeId: string) {
  const promo = await prisma.promoCode.findFirst({
    where: { id: promoCodeId, organizationId, isDeleted: false },
    select: { id: true },
  });
  if (!promo) throw new NotFoundError('Code promo', promoCodeId);
  return promo;
}

@injectable()
export class ListPromoCodeAssignmentsUseCase {
  async execute(
    organizationId: string,
    promoCodeId: string,
    pagination: { page?: number; limit?: number; search?: string },
  ) {
    await assertPromoInOrg(organizationId, promoCodeId);

    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where: Prisma.PromoCodeAssignmentWhereInput = {
      promoCodeId,
      ...(pagination.search
        ? { client: { fullName: { contains: pagination.search, mode: 'insensitive' } } }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.promoCodeAssignment.findMany({
        where,
        include: {
          client: { select: { id: true, fullName: true, phone: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.promoCodeAssignment.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}

@injectable()
export class AssignPromoCodeUseCase {
  /**
   * Attribue le code a une liste de clients. Idempotent : un client deja
   * attribue voit simplement son quota mis a jour. `replace: true` retire au
   * prealable les attributions qui n'ont pas encore servi.
   */
  async execute(
    organizationId: string,
    promoCodeId: string,
    input: AssignPromoCodeInput,
    userId?: string | null,
  ) {
    await assertPromoInOrg(organizationId, promoCodeId);

    const clientIds = [...new Set(input.clientIds)];
    const valid = await prisma.client.count({
      where: { id: { in: clientIds }, organizationId, isDeleted: false },
    });
    if (valid !== clientIds.length) {
      throw new NotFoundError('Client');
    }

    return prisma.$transaction(async (tx) => {
      if (input.replace) {
        // On ne retire que les attributions vierges : supprimer une attribution
        // deja utilisee ferait mentir les compteurs.
        await tx.promoCodeAssignment.deleteMany({
          where: { promoCodeId, usedCount: 0, clientId: { notIn: clientIds } },
        });
      }

      for (const clientId of clientIds) {
        await tx.promoCodeAssignment.upsert({
          where: { promoCodeId_clientId: { promoCodeId, clientId } },
          create: {
            promoCodeId,
            clientId,
            maxUses: input.maxUses ?? null,
            assignedByUserId: userId ?? null,
          },
          update: { maxUses: input.maxUses ?? null },
        });
      }

      return tx.promoCodeAssignment.count({ where: { promoCodeId } });
    });
  }
}

@injectable()
export class UnassignPromoCodeUseCase {
  async execute(organizationId: string, promoCodeId: string, clientId: string) {
    await assertPromoInOrg(organizationId, promoCodeId);

    const assignment = await prisma.promoCodeAssignment.findUnique({
      where: { promoCodeId_clientId: { promoCodeId, clientId } },
      select: { id: true, usedCount: true },
    });
    if (!assignment) throw new NotFoundError('Attribution');
    if (assignment.usedCount > 0) {
      throw new BusinessError(
        'Ce client a deja utilise le code : retirez plutot son quota restant en le passant a 0.',
        409,
        'PROMO_ASSIGNMENT_USED',
      );
    }

    await prisma.promoCodeAssignment.delete({ where: { id: assignment.id } });
    return { deleted: true };
  }
}

@injectable()
export class ListClientPromoCodesUseCase {
  /**
   * Codes visibles par un client donne : ses attributions nominatives plus,
   * si `includePublic`, les codes publics encore valables. Utilise par la page
   * "mes codes promo" du portail.
   */
  async execute(input: {
    organizationId: string;
    clientId: string;
    includePublic?: boolean;
  }) {
    const now = new Date();
    const validWindow: Prisma.PromoCodeWhereInput = {
      isActive: true,
      isDeleted: false,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
      ],
    };

    const [assignments, publicCodes] = await Promise.all([
      prisma.promoCodeAssignment.findMany({
        where: {
          clientId: input.clientId,
          promoCode: { organizationId: input.organizationId, ...validWindow },
        },
        include: { promoCode: { include: { routes: { select: { transitRouteId: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      input.includePublic
        ? prisma.promoCode.findMany({
            where: {
              organizationId: input.organizationId,
              visibility: 'PUBLIC',
              ...validWindow,
            },
            include: { routes: { select: { transitRouteId: true } } },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const assignedIds = new Set(assignments.map((a) => a.promoCodeId));

    return {
      assigned: assignments.map((a) => ({
        ...a.promoCode,
        assignment: {
          maxUses: a.maxUses ?? a.promoCode.maxUsesPerClient,
          usedCount: a.usedCount,
          remainingUses:
            (a.maxUses ?? a.promoCode.maxUsesPerClient) == null
              ? null
              : Math.max(0, (a.maxUses ?? a.promoCode.maxUsesPerClient)! - a.usedCount),
        },
      })),
      // Un code public deja attribue nominativement n'apparait qu'une fois.
      public: publicCodes.filter((p) => !assignedIds.has(p.id)),
    };
  }
}
