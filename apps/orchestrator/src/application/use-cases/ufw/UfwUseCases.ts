import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import {
  UFWService,
  UFW_SERVICE,
  type UfwStatus,
} from '../../../infrastructure/ufw/UFWService';
import type { SshConnection } from '../../../infrastructure/ssh/SSHService';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

const SELF_VPS_NAME = process.env.OPS_SELF_VPS_NAME ?? 'self';

/**
 * Charge un VPS et construit les credentials SSH pour piloter UFW.
 * Refuse si le VPS est local (placeholder SSH) - l'admin doit gerer UFW
 * directement via la CLI host dans ce cas (cf. scripts/manage-ufw.sh).
 */
async function getCreds(vpsId: string): Promise<{ name: string; creds: SshConnection }> {
  const vps = await prisma.vPS.findUnique({ where: { id: vpsId } });
  if (!vps) throw new NotFoundError('VPS', vpsId);
  if (vps.name === SELF_VPS_NAME) {
    throw new BusinessError(
      `UFW du VPS local (${vps.name}) doit etre gere via la CLI host (sudo ufw ...). ` +
        `L'orchestrator n'a pas d'acces SSH valide pour ce VPS.`,
    );
  }
  return {
    name: vps.name,
    creds: {
      host: vps.host,
      port: vps.port,
      username: vps.username,
      sshKeyEncrypted: vps.sshKeyEncrypted,
    },
  };
}

@injectable()
export class UfwUseCases {
  constructor(@inject(UFW_SERVICE) private ufw: UFWService) {}

  async getStatus(vpsId: string): Promise<UfwStatus> {
    const { creds } = await getCreds(vpsId);
    return this.ufw.status(creds);
  }

  async enable(vpsId: string) {
    const { creds } = await getCreds(vpsId);
    const r = await this.ufw.enable(creds);
    if (!r.ok) throw new BusinessError(r.message ?? 'ufw enable a echoue');
    return { enabled: true };
  }

  async disable(vpsId: string) {
    const { creds } = await getCreds(vpsId);
    const r = await this.ufw.disable(creds);
    if (!r.ok) throw new BusinessError(r.message ?? 'ufw disable a echoue');
    return { enabled: false };
  }

  async addRule(
    vpsId: string,
    input: { action: 'allow' | 'deny' | 'reject' | 'limit'; spec: string },
  ) {
    const { creds } = await getCreds(vpsId);
    const r = await this.ufw.addRule(creds, input);
    if (!r.ok) throw new BusinessError(r.message ?? 'ufw rule add a echoue');
    return this.ufw.status(creds);
  }

  async deleteRule(vpsId: string, index: number) {
    const { creds } = await getCreds(vpsId);
    const r = await this.ufw.deleteRule(creds, index);
    if (!r.ok) throw new BusinessError(r.message ?? 'ufw rule delete a echoue');
    return this.ufw.status(creds);
  }

  async applyBaseline(vpsId: string) {
    const { creds } = await getCreds(vpsId);
    const r = await this.ufw.applyBaseline(creds);
    if (!r.ok) {
      throw new BusinessError(`Baseline UFW partiellement appliquee : ${r.messages.join(' | ')}`);
    }
    return { ok: true, messages: r.messages };
  }
}
