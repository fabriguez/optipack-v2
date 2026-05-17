import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { prisma } from '../../../config/database';
import { SshKeyEncryption } from '../../../infrastructure/crypto/SshKeyEncryption';
import { SSHService, SSH_SERVICE } from '../../../infrastructure/ssh/SSHService';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

export const updateVpsSchema = z.object({
  name: z.string().min(2).optional(),
  // Connexion SSH : editables pour permettre de corriger un user/port mal
  // saisis a la creation (ex: VPS self pre-seede avec creds placeholder).
  host: z.string().min(2).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  username: z.string().min(1).optional(),
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
  // Plage de ports tenants editable par l'admin (PortAllocator la lit).
  portRangeStart: z.coerce.number().int().min(1024).max(65534).optional(),
  portRangeEnd: z.coerce.number().int().min(1025).max(65535).optional(),
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

  async list(filters: { status?: string; q?: string; page: number; pageSize: number }) {
    const where = {
      ...(filters.status && { status: filters.status as never }),
      ...(filters.q && {
        OR: [
          { name: { contains: filters.q, mode: 'insensitive' as const } },
          { host: { contains: filters.q, mode: 'insensitive' as const } },
          { region: { contains: filters.q, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.vPS.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { tenants: true } } },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.vPS.count({ where }),
    ]);
    return { items: items.map((v) => this.toPublic(v as never)), total };
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
    const creds = {
      host: vps.host,
      port: vps.port,
      username: vps.username,
      sshKeyEncrypted: vps.sshKeyEncrypted,
    };
    const test = await this.ssh.testConnection(creds);
    if (!test.ok) return test;

    // Re-probe specs + usage a chaque test, pour garder la BDD a jour
    // sans demander a l'admin de cliquer sur "Refresh".
    try {
      const [specs, usage] = await Promise.all([
        this.ssh.getSpecs(creds),
        this.ssh.getUsage(creds),
      ]);
      await prisma.vPS.update({
        where: { id },
        data: {
          ...(specs.totalCpu > 0 && { totalCpu: specs.totalCpu }),
          ...(specs.totalRamMb > 0 && { totalRamMb: specs.totalRamMb }),
          ...(specs.totalDiskGb > 0 && { totalDiskGb: specs.totalDiskGb }),
          cpuUsagePct: usage.cpuUsagePct,
          ramUsagePct: usage.ramUsagePct,
          diskUsagePct: usage.diskUsagePct,
          lastSeenAt: new Date(),
        },
      });
    } catch {
      // sonde non bloquante : on garde le succes du testConnection initial
    }
    return test;
  }

  /**
   * Probe l'usage de TOUS les VPS actifs en parallele. Best-effort : les
   * VPS injoignables sont simplement marques en erreur dans le retour mais
   * n'interrompent pas la sonde globale. Utilise par le dashboard pour
   * rafraichir les metriques affichees a chaque chargement.
   */
  async refreshAllUsage(): Promise<{ id: string; ok: boolean; error?: string }[]> {
    const vpsList = await prisma.vPS.findMany({ where: { status: 'ACTIVE' } });
    return Promise.all(
      vpsList.map(async (vps) => {
        try {
          await this.getUsage(vps.id);
          return { id: vps.id, ok: true };
        } catch (e) {
          return {
            id: vps.id,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    );
  }

  async getUsage(id: string) {
    const vps = await prisma.vPS.findUnique({ where: { id } });
    if (!vps) throw new NotFoundError('VPS', id);
    const creds = {
      host: vps.host,
      port: vps.port,
      username: vps.username,
      sshKeyEncrypted: vps.sshKeyEncrypted,
    };
    const usage = await this.ssh.getUsage(creds);

    // Si les specs hardware sont absentes (probe initial echoue ou VPS
    // ancien cree manuellement), on tente une re-detection sans demander a
    // l'admin de les saisir.
    let specsPatch: { totalCpu?: number; totalRamMb?: number; totalDiskGb?: number } = {};
    if (vps.totalCpu == null || vps.totalRamMb == null || vps.totalDiskGb == null) {
      try {
        const specs = await this.ssh.getSpecs(creds);
        if (specs.totalCpu > 0) specsPatch.totalCpu = specs.totalCpu;
        if (specs.totalRamMb > 0) specsPatch.totalRamMb = specs.totalRamMb;
        if (specs.totalDiskGb > 0) specsPatch.totalDiskGb = specs.totalDiskGb;
      } catch {
        // best-effort
      }
    }

    await prisma.vPS.update({
      where: { id },
      data: {
        cpuUsagePct: usage.cpuUsagePct,
        ramUsagePct: usage.ramUsagePct,
        diskUsagePct: usage.diskUsagePct,
        lastSeenAt: new Date(),
        ...specsPatch,
      },
    });
    return usage;
  }

  async update(id: string, input: UpdateVpsInput) {
    const vps = await prisma.vPS.findUnique({ where: { id } });
    if (!vps) throw new NotFoundError('VPS', id);

    // Si modif des params SSH (host/port/username/cle), on teste la nouvelle
    // combinaison AVANT de persister. Permet de corriger une mauvaise config
    // sans casser un VPS deja fonctionnel (l'ancienne config reste en place
    // si le test echoue).
    let sshKeyEncrypted: string | undefined;
    const sshTouched =
      input.sshPrivateKey !== undefined ||
      input.host !== undefined ||
      input.port !== undefined ||
      input.username !== undefined;
    if (sshTouched) {
      const newEncrypted = input.sshPrivateKey
        ? SshKeyEncryption.encrypt(input.sshPrivateKey)
        : vps.sshKeyEncrypted;
      const test = await this.ssh.testConnection({
        host: input.host ?? vps.host,
        port: input.port ?? vps.port,
        username: input.username ?? vps.username,
        sshKeyEncrypted: newEncrypted,
      });
      if (!test.ok) {
        throw new BusinessError(
          `Nouvelle config SSH invalide : ${test.message}. Verifie host/port/user/cle (correspond a une cle pub dans authorized_keys du user host ?).`,
        );
      }
      if (input.sshPrivateKey) sshKeyEncrypted = newEncrypted;
    }

    const updated = await prisma.vPS.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.host !== undefined && { host: input.host }),
        ...(input.port !== undefined && { port: input.port }),
        ...(input.username !== undefined && { username: input.username }),
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
        ...(input.portRangeStart !== undefined && { portRangeStart: input.portRangeStart }),
        ...(input.portRangeEnd !== undefined && { portRangeEnd: input.portRangeEnd }),
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
