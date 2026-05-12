import { z } from 'zod';

export const createReleaseSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+(-\w+)?$/, 'semver requis (ex: 1.4.2)'),
  apiImageTag: z.string().optional(),
  webImageTag: z.string().optional(),
  changelog: z.string().optional(),
  isStable: z.boolean().optional().default(false),
  isCritical: z.boolean().optional().default(false),
});
export type CreateReleaseInput = z.infer<typeof createReleaseSchema>;

export const updateReleaseSchema = z.object({
  changelog: z.string().optional(),
  isStable: z.boolean().optional(),
  isCritical: z.boolean().optional(),
});
export type UpdateReleaseInput = z.infer<typeof updateReleaseSchema>;
