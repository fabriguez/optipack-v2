import { z } from 'zod';

// Accepte semver pur (1.4.2, 2.0.0-beta1) ainsi que les channel-prefix
// utilises par notre CI (ex: beta-1.0.34, rc-2.1.0, v1.2.3).
const versionRegex = /^[\w-]*\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/;

export const createReleaseSchema = z.object({
  version: z
    .string()
    .regex(versionRegex, 'version invalide (ex: 1.4.2, beta-1.0.34, v2.0.0-rc1)'),
  apiImageTag: z.string().optional(),
  webImageTag: z.string().optional(),
  webClientImageTag: z.string().optional(),
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
