import { injectable } from 'tsyringe';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

interface CreateInput {
  warehouseId: string;
  transitType: 'AIR' | 'SEA' | 'LAND';
  transitRouteId?: string | null;
  minWeight?: number | null;
  maxWeight?: number | null;
  minVolume?: number | null;
  maxVolume?: number | null;
  freeDays: number;
  dailyRate: number;
  priority?: number;
  isActive?: boolean;
}

type UpdateInput = Partial<Omit<CreateInput, 'warehouseId'>>;

@injectable()
export class ListWarehouseStorageRulesUseCase {
  async execute(warehouseId: string) {
    return prisma.warehouseStorageFeeRule.findMany({
      where: { warehouseId },
      include: { transitRoute: { select: { id: true, name: true, type: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }
}

@injectable()
export class CreateWarehouseStorageRuleUseCase {
  async execute(input: CreateInput) {
    const wh = await prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!wh) throw new NotFoundError('Magasin', input.warehouseId);

    return prisma.warehouseStorageFeeRule.create({
      data: {
        warehouseId: input.warehouseId,
        transitType: input.transitType,
        transitRouteId: input.transitRouteId ?? null,
        minWeight: input.minWeight ?? null,
        maxWeight: input.maxWeight ?? null,
        minVolume: input.minVolume ?? null,
        maxVolume: input.maxVolume ?? null,
        freeDays: input.freeDays,
        dailyRate: input.dailyRate,
        priority: input.priority ?? 0,
        isActive: input.isActive ?? true,
      },
    });
  }
}

@injectable()
export class UpdateWarehouseStorageRuleUseCase {
  async execute(ruleId: string, input: UpdateInput) {
    const existing = await prisma.warehouseStorageFeeRule.findUnique({ where: { id: ruleId } });
    if (!existing) throw new NotFoundError('Regle frais magasinage', ruleId);

    const data: Prisma.WarehouseStorageFeeRuleUpdateInput = {};
    if (input.transitType !== undefined) data.transitType = input.transitType;
    if (input.transitRouteId !== undefined) {
      data.transitRoute = input.transitRouteId ? { connect: { id: input.transitRouteId } } : { disconnect: true };
    }
    if (input.minWeight !== undefined) data.minWeight = input.minWeight;
    if (input.maxWeight !== undefined) data.maxWeight = input.maxWeight;
    if (input.minVolume !== undefined) data.minVolume = input.minVolume;
    if (input.maxVolume !== undefined) data.maxVolume = input.maxVolume;
    if (input.freeDays !== undefined) data.freeDays = input.freeDays;
    if (input.dailyRate !== undefined) data.dailyRate = input.dailyRate;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    return prisma.warehouseStorageFeeRule.update({ where: { id: ruleId }, data });
  }
}

@injectable()
export class DeleteWarehouseStorageRuleUseCase {
  async execute(ruleId: string) {
    const existing = await prisma.warehouseStorageFeeRule.findUnique({ where: { id: ruleId } });
    if (!existing) throw new NotFoundError('Regle frais magasinage', ruleId);
    await prisma.warehouseStorageFeeRule.delete({ where: { id: ruleId } });
  }
}
