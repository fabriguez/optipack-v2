import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { prisma } from '../../../config/database';
import { SshKeyEncryption } from '../../../infrastructure/crypto/SshKeyEncryption';
import { SSHService, SSH_SERVICE } from '../../../infrastructure/ssh/SSHService';
import { BusinessError, ConflictError } from '../../../domain/errors/BusinessError';

export const createVpsSchema = z.object({
  name: z.string().min(2),
  host: z.string().min(2),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().min(1),
  sshPrivateKey: z.string().min(20),
  region: z.string().optional(),
  notes: z.string().optional(),
  totalCpu: z.number().int().positive().optional(),
  totalRamMb: z.number().int().positive().optional(),
  totalDiskGb: z.number().int().positive().optional(),
});

export type CreateVpsInput = z.infer<typeof createVpsSchema>;

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
