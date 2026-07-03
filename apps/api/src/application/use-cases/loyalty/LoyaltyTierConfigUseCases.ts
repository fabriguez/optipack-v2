import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

interface UpsertInput {
  organizationId: string;
  tiers: Array<{
    id?: string;
    name: string;
    minPoints: number;
    discountPercent: number;
    benefits?: Record<string, any> | null;
  }>;
}

@injectable()
export class ListLoyaltyTierConfigsUseCase {
  async execute(organizationId: string) {
    return prisma.loyaltyTierConfig.findMany({
      where: { organizationId },
      orderBy: { minPoints: 'asc' },
    });
  }
}

@injectable()
export class UpsertLoyaltyTierConfigsUseCase {
  /**
   * Replace-all : remplace integralement la grille de tiers de l'organisation.
   * On supprime ceux qui ne sont plus dans la liste, on cree/MAJ les autres.
   */
  async execute({ organizationId, tiers }: UpsertInput) {
    if (!Array.isArray(tiers)) throw new BusinessError('tiers manquant');

    // Validation
    const names = new Set<string>();
    for (const t of tiers) {
      if (!t.name?.trim()) throw new BusinessError('Nom obligatoire pour chaque tier');
      if (names.has(t.name)) throw new BusinessError(`Tier en doublon : ${t.name}`);
      names.add(t.name);
      if (t.minPoints < 0) throw new BusinessError(`minPoints invalide pour ${t.name}`);
      if (t.discountPercent < 0 || t.discountPercent > 100) {
        throw new BusinessError(`discountPercent invalide pour ${t.name}`);
      }
    }

    return prisma.$transaction(async (tx) => {
      const existing = await tx.loyaltyTierConfig.findMany({ where: { organizationId } });
      const existingIds = new Set(existing.map((e) => e.id));
      // Anti-IDOR : tout id fourni doit appartenir a un tier de l'organisation.
      for (const t of tiers) {
        if (t.id && !existingIds.has(t.id)) {
          throw new NotFoundError('Tier', t.id);
        }
      }
      const keepIds = new Set(tiers.filter((t) => t.id).map((t) => t.id as string));
      // Suppression de ceux retires
      for (const e of existing) {
        if (!keepIds.has(e.id)) {
          await tx.loyaltyTierConfig.delete({ where: { id: e.id } });
        }
      }
      // Upsert des envoyes
      const result = [];
      for (const t of tiers) {
        if (t.id) {
          result.push(
            await tx.loyaltyTierConfig.update({
              where: { id: t.id },
              data: {
                name: t.name.trim(),
                minPoints: t.minPoints,
                discountPercent: t.discountPercent,
                benefits: (t.benefits ?? null) as any,
              },
            }),
          );
        } else {
          result.push(
            await tx.loyaltyTierConfig.create({
              data: {
                organizationId,
                name: t.name.trim(),
                minPoints: t.minPoints,
                discountPercent: t.discountPercent,
                benefits: (t.benefits ?? null) as any,
              },
            }),
          );
        }
      }
      return result;
    });
  }
}

@injectable()
export class DeleteLoyaltyTierConfigUseCase {
  async execute(id: string, organizationId: string) {
    const item = await prisma.loyaltyTierConfig.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundError('Tier', id);
    await prisma.loyaltyTierConfig.delete({ where: { id } });
  }
}
