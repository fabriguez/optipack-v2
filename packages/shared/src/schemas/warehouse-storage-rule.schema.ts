import { z } from 'zod';

const transitTypeEnum = z.enum(['AIR', 'SEA', 'LAND']);

export const createWarehouseStorageRuleSchema = z
  .object({
    transitType: transitTypeEnum,
    transitRouteId: z.string().uuid().optional().nullable(),
    minWeight: z.number().nonnegative().optional().nullable(),
    maxWeight: z.number().nonnegative().optional().nullable(),
    minVolume: z.number().nonnegative().optional().nullable(),
    maxVolume: z.number().nonnegative().optional().nullable(),
    freeDays: z.number().int().nonnegative().default(0),
    dailyRate: z.number().nonnegative(),
    priority: z.number().int().default(0),
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.minWeight != null && data.maxWeight != null && data.minWeight > data.maxWeight) {
      ctx.addIssue({ code: 'custom', message: 'minWeight > maxWeight', path: ['minWeight'] });
    }
    if (data.minVolume != null && data.maxVolume != null && data.minVolume > data.maxVolume) {
      ctx.addIssue({ code: 'custom', message: 'minVolume > maxVolume', path: ['minVolume'] });
    }
    // Coherence avec le type de transit : on exige au moins un intervalle
    // adapte au type (sauf si pas de bornes -> regle "fourre-tout").
    const hasW = data.minWeight != null || data.maxWeight != null;
    const hasV = data.minVolume != null || data.maxVolume != null;
    if (data.transitType === 'AIR' && hasV && !hasW) {
      ctx.addIssue({ code: 'custom', message: 'AIR utilise un intervalle de masse', path: ['minWeight'] });
    }
    if (data.transitType === 'SEA' && hasW && !hasV) {
      ctx.addIssue({ code: 'custom', message: 'SEA utilise un intervalle de volume', path: ['minVolume'] });
    }
  });

export const updateWarehouseStorageRuleSchema = z
  .object({
    transitType: transitTypeEnum.optional(),
    transitRouteId: z.string().uuid().optional().nullable(),
    minWeight: z.number().nonnegative().optional().nullable(),
    maxWeight: z.number().nonnegative().optional().nullable(),
    minVolume: z.number().nonnegative().optional().nullable(),
    maxVolume: z.number().nonnegative().optional().nullable(),
    freeDays: z.number().int().nonnegative().optional(),
    dailyRate: z.number().nonnegative().optional(),
    priority: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .partial();

export type CreateWarehouseStorageRuleInput = z.infer<typeof createWarehouseStorageRuleSchema>;
export type UpdateWarehouseStorageRuleInput = z.infer<typeof updateWarehouseStorageRuleSchema>;
