import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { SshKeyEncryption } from '../../../infrastructure/crypto/SshKeyEncryption';
import { SSHService, SSH_SERVICE } from '../../../infrastructure/ssh/SSHService';
import { BusinessError, ConflictError } from '../../../domain/errors/BusinessError';
import { VpsBootstrapService } from '../../services/VpsBootstrapService';
import { logger } from '../../../infrastructure/logger';

// Schemas migres dans @transitsoftservices/ops-schemas (partages avec ops-admin).
import { createVpsSchema, type CreateVpsInput } from '@transitsoftservices/ops-schemas';
export { createVpsSchema, type CreateVpsInput };

@injectable()
export class CreateVpsUseCase {
  constructor(
    @inject(SSH_SERVICE) private ssh: SSHService,
    private bootstrap: VpsBootstrapService,
  ) {}

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

    // Bootstrap auto : installe Docker + Caddy + Git + UFW si demande.
    // Active par defaut (anciennement les admins devaient le faire a la main
    // via doc vps-setup.md). On peut desactiver par tenant en passant
    // input.autoBootstrap=false ou via OPS_VPS_AUTO_BOOTSTRAP=false en env.
    const wantBootstrap =
      (input as { autoBootstrap?: boolean }).autoBootstrap ??
      process.env.OPS_VPS_AUTO_BOOTSTRAP !== 'false';
    if (wantBootstrap) {
      const autoEnableUfw =
        (input as { autoEnableUfw?: boolean }).autoEnableUfw ??
        process.env.OPS_UFW_AUTO_ENABLE === 'true';
      try {
        const report = await this.bootstrap.bootstrap(
          { host: input.host, port: input.port, username: input.username, sshKeyEncrypted },
          { autoEnableUfw },
        );
        logger.info({ vpsId: vps.id, report }, '[vps] bootstrap done');
      } catch (err) {
        // Non bloquant : admin peut reessayer via endpoint dedie. Le VPS est
        // deja enregistre, il reste utilisable si Docker/Caddy sont deja la.
        logger.warn(
          { vpsId: vps.id, err: err instanceof Error ? err.message : String(err) },
          '[vps] bootstrap failed (non bloquant)',
        );
      }
    }

    return this.toPublic(vps);
  }

  // Helper : ne JAMAIS exposer sshKeyEncrypted en sortie API
  private toPublic<T extends { id: string; sshKeyEncrypted: string }>(v: T) {
    const { sshKeyEncrypted: _omit, ...rest } = v;
    return { ...rest, sshKeyFingerprint: SshKeyEncryption.fingerprint(v.sshKeyEncrypted) };
  }
}
