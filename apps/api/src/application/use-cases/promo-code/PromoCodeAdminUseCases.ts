/**
 * CRUD des codes promo cote administration tenant.
 *
 * Un code n'est jamais supprime physiquement des qu'il a servi : les
 * redemptions doivent rester lisibles pour l'audit. On bascule alors en
 * soft delete (isDeleted) plutot que de casser l'historique.
 */
import { injectable } from 'tsyringe';
import type { Prisma } from '@prisma/client';
import type { CreatePromoCodeInput, UpdatePromoCodeInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { ConflictError, NotFoundError } from '../../../domain/errors/BusinessError';
import { normalizePromoCode } from '../../services/promo/promoCodeRules';

const LIST_INCLUDE = {
  routes: { select: { transitRoute: { select: { id: true, name: true, type: true } } } },
  _count: { select: { assignments: true, redemptions: true } },
} satisfies Prisma.PromoCodeInclude;

export interface ListPromoCodesFilters {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  visibility?: 'PUBLIC' | 'PRIVATE' | 'ASSIGNED';
  /** true = ne renvoie que les codes encore valables a l'instant present. */
  activeOnly?: boolean;
}

function scopeFields(input: CreatePromoCodeInput | UpdatePromoCodeInput) {
  return {
    parcelCategories: input.parcelCategories,
    transitTypes: input.transitTypes,
  };
}

@injectable()
export class ListPromoCodesUseCase {
  async execute(organizationId: string, filters: ListPromoCodesFilters) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const now = new Date();

    const where: Prisma.PromoCodeWhereInput = {
      organizationId,
      isDeleted: false,
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.visibility ? { visibility: filters.visibility } : {}),
      ...(filters.search
        ? {
            OR: [
              { code: { contains: filters.search, mode: 'insensitive' } },
              { label: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filters.activeOnly
        ? {
            isActive: true,
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.promoCode.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.promoCode.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}

@injectable()
export class GetPromoCodeUseCase {
  async execute(organizationId: string, id: string) {
    const promo = await prisma.promoCode.findFirst({
      where: { id, organizationId, isDeleted: false },
      include: LIST_INCLUDE,
    });
    if (!promo) throw new NotFoundError('Code promo', id);
    return promo;
  }
}

@injectable()
export class CreatePromoCodeUseCase {
  async execute(organizationId: string, input: CreatePromoCodeInput, userId?: string | null) {
    const code = normalizePromoCode(input.code);
    const existing = await prisma.promoCode.findUnique({
      where: { organizationId_code: { organizationId, code } },
      select: { id: true, isDeleted: true },
    });
    if (existing) {
      throw new ConflictError(`Le code "${code}" existe deja.`);
    }
    await assertRoutesBelongToOrg(organizationId, input.transitRouteIds);

    return prisma.promoCode.create({
      data: {
        organizationId,
        code,
        label: input.label,
        description: input.description ?? null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        maxDiscountAmount: input.maxDiscountAmount ?? null,
        minOrderAmount: input.minOrderAmount ?? null,
        maxOrderAmount: input.maxOrderAmount ?? null,
        ...scopeFields(input),
        startsAt: input.startsAt ?? null,
        expiresAt: input.expiresAt ?? null,
        maxUses: input.maxUses ?? null,
        maxUsesPerClient: input.maxUsesPerClient ?? null,
        visibility: input.visibility,
        createdByUserId: userId ?? null,
        routes: {
          create: input.transitRouteIds.map((transitRouteId) => ({ transitRouteId })),
        },
      },
      include: LIST_INCLUDE,
    });
  }
}

@injectable()
export class UpdatePromoCodeUseCase {
  async execute(organizationId: string, id: string, input: UpdatePromoCodeInput) {
    const promo = await prisma.promoCode.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: { id: true, code: true },
    });
    if (!promo) throw new NotFoundError('Code promo', id);

    const code = input.code ? normalizePromoCode(input.code) : undefined;
    if (code && code !== promo.code) {
      const clash = await prisma.promoCode.findUnique({
        where: { organizationId_code: { organizationId, code } },
        select: { id: true },
      });
      if (clash) throw new ConflictError(`Le code "${code}" existe deja.`);
    }
    if (input.transitRouteIds) {
      await assertRoutesBelongToOrg(organizationId, input.transitRouteIds);
    }

    return prisma.$transaction(async (tx) => {
      if (input.transitRouteIds) {
        await tx.promoCodeTransitRoute.deleteMany({ where: { promoCodeId: id } });
        if (input.transitRouteIds.length > 0) {
          await tx.promoCodeTransitRoute.createMany({
            data: input.transitRouteIds.map((transitRouteId) => ({
              promoCodeId: id,
              transitRouteId,
            })),
          });
        }
      }

      return tx.promoCode.update({
        where: { id },
        data: {
          ...(code ? { code } : {}),
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.description !== undefined ? { description: input.description ?? null } : {}),
          ...(input.discountType !== undefined ? { discountType: input.discountType } : {}),
          ...(input.discountValue !== undefined ? { discountValue: input.discountValue } : {}),
          ...(input.maxDiscountAmount !== undefined
            ? { maxDiscountAmount: input.maxDiscountAmount ?? null }
            : {}),
          ...(input.minOrderAmount !== undefined
            ? { minOrderAmount: input.minOrderAmount ?? null }
            : {}),
          ...(input.maxOrderAmount !== undefined
            ? { maxOrderAmount: input.maxOrderAmount ?? null }
            : {}),
          ...(input.parcelCategories !== undefined
            ? { parcelCategories: input.parcelCategories }
            : {}),
          ...(input.transitTypes !== undefined ? { transitTypes: input.transitTypes } : {}),
          ...(input.startsAt !== undefined ? { startsAt: input.startsAt ?? null } : {}),
          ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ?? null } : {}),
          ...(input.maxUses !== undefined ? { maxUses: input.maxUses ?? null } : {}),
          ...(input.maxUsesPerClient !== undefined
            ? { maxUsesPerClient: input.maxUsesPerClient ?? null }
            : {}),
          ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        include: LIST_INCLUDE,
      });
    });
  }
}

@injectable()
export class DeletePromoCodeUseCase {
  /**
   * Suppression franche si le code n'a jamais servi, soft delete sinon pour
   * preserver l'historique des utilisations.
   */
  async execute(organizationId: string, id: string) {
    const promo = await prisma.promoCode.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: { id: true, _count: { select: { redemptions: true } } },
    });
    if (!promo) throw new NotFoundError('Code promo', id);

    if (promo._count.redemptions === 0) {
      await prisma.promoCode.delete({ where: { id } });
      return { deleted: true, softDeleted: false };
    }

    await prisma.promoCode.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), isActive: false },
    });
    return { deleted: true, softDeleted: true };
  }
}

@injectable()
export class ListPromoCodeRedemptionsUseCase {
  async execute(
    organizationId: string,
    promoCodeId: string,
    pagination: { page?: number; limit?: number },
  ) {
    const promo = await prisma.promoCode.findFirst({
      where: { id: promoCodeId, organizationId },
      select: { id: true },
    });
    if (!promo) throw new NotFoundError('Code promo', promoCodeId);

    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where: Prisma.PromoCodeRedemptionWhereInput = { promoCodeId };

    const [data, total] = await Promise.all([
      prisma.promoCodeRedemption.findMany({
        where,
        include: {
          client: { select: { id: true, fullName: true } },
          invoice: { select: { id: true, reference: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.promoCodeRedemption.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}

/** Anti-IDOR : une route referencee doit appartenir au meme tenant. */
async function assertRoutesBelongToOrg(organizationId: string, routeIds: string[]) {
  if (!routeIds || routeIds.length === 0) return;
  const count = await prisma.transitRoute.count({
    where: { id: { in: routeIds }, organizationId },
  });
  if (count !== new Set(routeIds).size) {
    throw new NotFoundError('Route de transit');
  }
}
