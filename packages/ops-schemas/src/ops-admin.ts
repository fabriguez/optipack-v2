import { z } from 'zod';
import { emailSchema } from './common';

export const inviteOpsAdminSchema = z.object({
  email: emailSchema,
  fullName: z.string().min(2),
  /** Mot de passe initial (a changer au 1er login). Si non fourni, on en genere un. */
  initialPassword: z.string().min(8).optional(),
  isSuperAdmin: z.boolean().optional().default(false),
});
export type InviteOpsAdminInput = z.infer<typeof inviteOpsAdminSchema>;

export const updateOpsAdminSchema = z.object({
  fullName: z.string().min(2).optional(),
  isActive: z.boolean().optional(),
  isSuperAdmin: z.boolean().optional(),
});
export type UpdateOpsAdminInput = z.infer<typeof updateOpsAdminSchema>;
