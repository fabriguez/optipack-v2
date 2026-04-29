import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { prisma } from '../../../config/database';
import { SshKeyEncryption } from '../../../infrastructure/crypto/SshKeyEncryption';
import { SSHService, SSH_SERVICE } from '../../../infrastructure/ssh/SSHService';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

export const updateVpsSchema = z.object({
  name: z.string().min(2).optional(),
  // Si fourni, rotate la cle SSH. Le service teste avant de persister.
  sshPrivateKey: z.string().min(20).optional(),
  region: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  totalCpu: z.number().int().positive().optional().nullable(),
  totalRamMb: z.number().int().positive().optional().nullable(),
  totalDiskGb: z.number().int().positive().optional().nullable(),
  // Configuration capacite (Phase 4)
  reservedCpu: z.number().nonnegative().optional(),
  reservedRamMb: z.number().int().nonnegative().optional(),
  reservedDiskGb: z.number().int().nonnegative().optional(),
  cpuOvercommit: z.number().min(0.5).max(5).optional(),
  memoryOvercommit: z.number().min(0.5).max(3).optional(),
  diskOvercommit: z.number().min(0.5).max(2).optional(),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).optional(),
});

export type UpdateVpsInput = z.infer<typeof updateVpsSchema>;

/**
 * Services lecture / actions simples sur VPS : list, get, test-connection,
 * usage live, delete (refus si tenants actifs).
 */
@injectable()
export class VpsQueryService {
  constructor(@inject(SSH_SERVICE) private ssh: SSHService) {}

  private toPublic(v: { sshKeyEncrypted: string } & Record<string, unknown>) {
    const { sshKeyEncrypted: _omit, ...rest } = v;
    return { ...rest, sshKeyFingerprint: SshKeyEncryption.fingerprint(v.sshKeyEncrypted) };
  }

  async list(filters: { status?: string }) {
    const items = await prisma.vPS.findMany({
      where: { ...(filters.status && { status: filters.status as never }) },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { tenants: true } } },
    });
    return items.map((v) => this.toPublic(v as never));
  }

  async getById(id: string) {
    const vps = await prisma.vPS.findUnique({
      where: { id },
      include: { _count: { select: { tenants: true } } },
    });
    if (!vps) throw new NotFoundError('VPS', id);
    return this.toPublic(vps as never);
  }

  async testConnection(id: string) {
    const vps = await prisma.vPS.findUnique({ where: { id } });
    if (!vps) throw new NotFoundError('VPS', id);
    return this.ssh.testConnection({
      host: vps.host,
      port: vps.port,
      username: vps.username,
      sshKeyEncrypted: vps.sshKeyEncrypted,
    });
  }

  async getUsage(id: string) {
    const vps = await prisma.vPS.findUnique({ where: { id } });
    if (!vps) throw new NotFoundError('VPS', id);
    const usage = await this.ssh.getUsage({
      host: vps.host,
      port: vps.port,
      username: vps.username,
      sshKeyEncrypted: vps.sshKeyEncrypted,
    });
    // Mise a jour des dernieres metriques snapshot
    await prisma.vPS.update({
      where: { id },
      data: {
        cpuUsagePct: usage.cpuUsagePct,
        ramUsagePct: usage.ramUsagePct,
        diskUsagePct: usage.diskUsagePct,
        lastSeenAt: new Date(),
      },
    });
    return usage;
  }

  async update(id: string, input: UpdateVpsInput) {
    const vps = await prisma.vPS.findUnique({ where: { id } });
    if (!vps) throw new NotFoundError('VPS', id);

    // Si rotation de la cle SSH : tester avant de persister
    let sshKeyEncrypted: string | undefined;
    if (input.sshPrivateKey) {
      const newEncrypted = SshKeyEncryption.encrypt(input.sshPrivateKey);
      const test = await this.ssh.testConnection({
        host: vps.host,
        port: vps.port,
        username: vps.username,
        sshKeyEncrypted: newEncrypted,
      });
      if (!test.ok) {
        throw new BusinessError(`Nouvelle cle SSH invalide : ${test.message}`);
      }
      sshKeyEncrypted = newEncrypted;
    }

    const updated = await prisma.vPS.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.region !== undefined && { region: input.region }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.totalCpu !== undefined && { totalCpu: input.totalCpu }),
        ...(input.totalRamMb !== undefined && { totalRamMb: input.totalRamMb }),
        ...(input.totalDiskGb !== undefined && { totalDiskGb: input.totalDiskGb }),
        // Capacite (Phase 4)
        ...(input.reservedCpu !== undefined && { reservedCpu: input.reservedCpu }),
        ...(input.reservedRamMb !== undefined && { reservedRamMb: input.reservedRamMb }),
        ...(input.reservedDiskGb !== undefined && { reservedDiskGb: input.reservedDiskGb }),
        ...(input.cpuOvercommit !== undefined && { cpuOvercommit: input.cpuOvercommit }),
        ...(input.memoryOvercommit !== undefined && { memoryOvercommit: input.memoryOvercommit }),
        ...(input.diskOvercommit !== undefined && { diskOvercommit: input.diskOvercommit }),
        ...(input.status !== undefined && { status: input.status }),
        ...(sshKeyEncrypted && { sshKeyEncrypted }),
      },
    });
    return this.toPublic(updated as never);
  }

  async delete(id: string) {
    const vps = await prisma.vPS.findUnique({
      where: { id },
      include: { _count: { select: { tenants: true } } },
    });
    if (!vps) throw new NotFoundError('VPS', id);
    if (vps._count.tenants > 0) {
      throw new BusinessError(
        `Impossible de supprimer ce VPS : ${vps._count.tenants} tenant(s) y sont heberges. Migrez-les ou supprimez-les d'abord.`,
      );
    }
    // Soft : passer en DECOMMISSIONED. Hard delete reserve a un nettoyage admin.
    await prisma.vPS.update({
      where: { id },
      data: { status: 'DECOMMISSIONED' },
    });
  }
}
