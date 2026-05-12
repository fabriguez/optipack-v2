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

    const vps = await prisma.vPS.create({
      data: {
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
        sshKeyEncrypted,
        region: input.region ?? null,
        notes: input.notes ?? null,
        totalCpu: input.totalCpu ?? null,
        totalRamMb: input.totalRamMb ?? null,
        totalDiskGb: input.totalDiskGb ?? null,
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
