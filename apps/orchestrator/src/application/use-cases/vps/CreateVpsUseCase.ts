import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { SshKeyEncryption } from '../../../infrastructure/crypto/SshKeyEncryption';
import { SSHService, SSH_SERVICE } from '../../../infrastructure/ssh/SSHService';
import { BusinessError, ConflictError } from '../../../domain/errors/BusinessError';

// Schemas migres dans @transitsoftservices/ops-schemas (partages avec ops-admin).
import { createVpsSchema, type CreateVpsInput } from '@transitsoftservices/ops-schemas';
export { createVpsSchema, type CreateVpsInput };

@injectable()
export class CreateVpsUseCase {
  constructor(@inject(SSH_SERVICE) private ssh: SSHService) {}

  async execute(input: CreateVpsInput) {
    // Test la connexion AVANT de creer le record (sinon on laisse une SSH key
    // chiffree dans la BDD pour rien)
    const test = await this.ssh.testConnection({
      host: input.host,
      port: input.port,
      username: input.username,
      sshKeyEncrypted: SshKeyEncryption.encrypt(input.sshPrivateKey),
    });
    if (!test.ok) {
      throw new BusinessError(`Connexion SSH echouee : ${test.message}`);
    }

    // Pas de duplicate sur (host, port, username)
    const dup = await prisma.vPS.findFirst({
      where: { host: input.host, port: input.port, username: input.username },
    });
    if (dup) {
      throw new ConflictError(
        `Un VPS avec ${input.username}@${input.host}:${input.port} existe deja`,
      );
    }

    const sshKeyEncrypted = SshKeyEncryption.encrypt(input.sshPrivateKey);

    // Probe automatique des specs hardware via SSH (nproc, /proc/meminfo, df).
    // Best-effort : si echec, on retombe sur les valeurs eventuellement
    // saisies en input. Evite a l'admin de remplir des champs qu'on peut
    // lire directement sur le serveur.
    let probed: { totalCpu?: number; totalRamMb?: number; totalDiskGb?: number } = {};
    let usage: { cpuUsagePct?: number; ramUsagePct?: number; diskUsagePct?: number } = {};
    try {
      const creds = {
        host: input.host,
        port: input.port,
        username: input.username,
        sshKeyEncrypted,
      };
      const [specs, u] = await Promise.all([this.ssh.getSpecs(creds), this.ssh.getUsage(creds)]);
      probed = {
        totalCpu: specs.totalCpu || undefined,
        totalRamMb: specs.totalRamMb || undefined,
        totalDiskGb: specs.totalDiskGb || undefined,
      };
      usage = u;
    } catch {
      // probe optionnel : on ne fail pas la creation si la sonde echoue
    }

    const vps = await prisma.vPS.create({
      data: {
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
        sshKeyEncrypted,
        region: input.region ?? null,
        notes: input.notes ?? null,
        totalCpu: probed.totalCpu ?? input.totalCpu ?? null,
        totalRamMb: probed.totalRamMb ?? input.totalRamMb ?? null,
        totalDiskGb: probed.totalDiskGb ?? input.totalDiskGb ?? null,
        cpuUsagePct: usage.cpuUsagePct ?? null,
        ramUsagePct: usage.ramUsagePct ?? null,
        diskUsagePct: usage.diskUsagePct ?? null,
        lastSeenAt: new Date(),
      },
    });

    return this.toPublic(vps);
  }

  // Helper : ne JAMAIS exposer sshKeyEncrypted en sortie API
  private toPublic<T extends { id: string; sshKeyEncrypted: string }>(v: T) {
    const { sshKeyEncrypted: _omit, ...rest } = v;
    return { ...rest, sshKeyFingerprint: SshKeyEncryption.fingerprint(v.sshKeyEncrypted) };
  }
}
