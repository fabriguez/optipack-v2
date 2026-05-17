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
  // Editables pour corriger un VPS mal configure (notamment self pre-seede).
  host: z.string().min(2).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  username: z.string().min(1).optional(),
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
  // Plage de ports pour les tenants (api/web/web-client). 30000-39999 par
  // defaut. Refine global : start < end.
  portRangeStart: z.coerce.number().int().min(1024).max(65534).optional(),
  portRangeEnd: z.coerce.number().int().min(1025).max(65535).optional(),
}).refine(
  (d) =>
    d.portRangeStart === undefined ||
    d.portRangeEnd === undefined ||
    d.portRangeStart < d.portRangeEnd,
  { message: 'portRangeStart doit etre strictement inferieur a portRangeEnd', path: ['portRangeEnd'] },
);
export type UpdateVpsInput = z.infer<typeof updateVpsSchema>;
