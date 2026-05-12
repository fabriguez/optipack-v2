import { z } from 'zod';
import { slugSchema, hexColorSchema, emailSchema, httpUrlSchema, uuidSchema } from './common';

export const createTenantSchema = z.object({
  slug: slugSchema,
  name: z.string().min(2),
  ownerEmail: emailSchema,
  ownerUsername: z.string().min(2),
  vpsId: uuidSchema,
  customDomain: z.string().optional().nullable(),
  primaryColor: hexColorSchema.optional(),
  secondaryColor: hexColorSchema.optional(),
  accentColor: hexColorSchema.optional(),
  enabledModules: z.array(z.string()).optional(),
  logoUrl: httpUrlSchema.optional().nullable(),
  plan: z.enum(['starter', 'pro', 'enterprise']).optional().default('starter'),
  pricePerMonth: z.coerce.number().nonnegative().optional().default(0),
  trialDays: z.coerce.number().int().nonnegative().optional().default(14),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = z.object({
  name: z.string().min(2).optional(),
  customDomain: z.string().optional().nullable(),
  enabledModules: z.array(z.string()).optional(),
  logoUrl: httpUrlSchema.optional().nullable(),
  primaryColor: hexColorSchema.optional(),
  secondaryColor: hexColorSchema.optional(),
  accentColor: hexColorSchema.optional(),
  pinnedVersion: z.string().optional().nullable(),
  autoUpdatePolicy: z.enum(['MANUAL', 'AUTO_STABLE', 'AUTO_CRITICAL_ONLY']).optional(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const migrateTenantSchema = z.object({
  targetVpsId: uuidSchema,
});
export type MigrateTenantInput = z.infer<typeof migrateTenantSchema>;
