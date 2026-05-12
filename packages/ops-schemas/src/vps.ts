import { z } from 'zod';

export const createVpsSchema = z.object({
  name: z.string().min(2),
  host: z.string().min(2),
  port: z.coerce.number().int().min(1).max(65535).default(22),
  username: z.string().min(1),
  /** Cle SSH privee complete au format OpenSSH (BEGIN ... END). Stockee chiffree. */
  sshPrivateKey: z.string().min(20),
  region: z.string().optional(),
  notes: z.string().optional(),
  totalCpu: z.coerce.number().int().positive().optional(),
  totalRamMb: z.coerce.number().int().positive().optional(),
  totalDiskGb: z.coerce.number().int().positive().optional(),
});
export type CreateVpsInput = z.infer<typeof createVpsSchema>;

export const updateVpsSchema = z.object({
  name: z.string().min(2).optional(),
  region: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  sshPrivateKey: z.string().min(20).optional(),
  totalCpu: z.coerce.number().int().positive().optional(),
  totalRamMb: z.coerce.number().int().positive().optional(),
  totalDiskGb: z.coerce.number().int().positive().optional(),
  reservedCpu: z.coerce.number().nonnegative().optional(),
  reservedRamMb: z.coerce.number().int().nonnegative().optional(),
  reservedDiskGb: z.coerce.number().int().nonnegative().optional(),
  cpuOvercommit: z.coerce.number().min(1).optional(),
  memoryOvercommit: z.coerce.number().min(1).optional(),
  diskOvercommit: z.coerce.number().min(1).optional(),
});
export type UpdateVpsInput = z.infer<typeof updateVpsSchema>;
