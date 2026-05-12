import { z } from 'zod';

export const createPlanSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'minuscules, chiffres, tirets'),
  name: z.string().min(2),
  description: z.string().optional(),
  pricePerMonth: z.coerce.number().nonnegative(),
  currency: z.string().default('XAF'),
  cpuLimit: z.coerce.number().positive(),
  memoryMb: z.coerce.number().int().positive(),
  diskQuotaGb: z.coerce.number().int().positive(),
  maxParcelsPerMonth: z.coerce.number().int().nonnegative().optional(),
  maxUsers: z.coerce.number().int().nonnegative().optional(),
  defaultModules: z.array(z.string()).optional().default([]),
  isPublic: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().optional().default(0),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = createPlanSchema.partial().omit({ code: true });
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
