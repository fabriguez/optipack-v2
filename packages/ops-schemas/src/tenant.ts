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
  // FK vers ResourcePlan (table BDD). Sans ca, le tenant tombe sur les
  // limites par defaut (0.5 CPU, 512MB) au provisioning.
  resourcePlanId: uuidSchema.optional(),
  pricePerMonth: z.coerce.number().nonnegative().optional().default(0),
  trialDays: z.coerce.number().int().nonnegative().optional().default(14),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const skinCustomizationSchema = z
  .object({
    primary: hexColorSchema.optional(),
    accent: hexColorSchema.optional(),
    radius: z.number().min(0).max(2).optional(),
    fontBody: z.string().optional(),
    fontHeading: z.string().optional(),
    imageOverrides: z
      .object({
        hero: z.string().optional(),
        authShell: z.string().optional(),
        preview: z.string().optional(),
      })
      .partial()
      .optional(),
  })
  .partial();
export type SkinCustomizationInput = z.infer<typeof skinCustomizationSchema>;

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
  skinId: z.string().nullable().optional(),
  // Theme = palette de couleurs (independant du skin/layout).
  themeId: z.string().nullable().optional(),
  skinCustomization: skinCustomizationSchema.nullable().optional(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const migrateTenantSchema = z.object({
  targetVpsId: uuidSchema,
});
export type MigrateTenantInput = z.infer<typeof migrateTenantSchema>;
