import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import {
  CaddyService,
  CADDY_SERVICE,
  type TenantCaddyEntry,
} from '../../../infrastructure/caddy/CaddyService';
import {
  SSHService,
  SSH_SERVICE,
  type SshConnection,
} from '../../../infrastructure/ssh/SSHService';
import { BusinessError } from '../../../domain/errors/BusinessError';

const BASE_DOMAIN = process.env.OPS_BASE_DOMAIN ?? 'transitsoftservices.com';
const CADDY_EMAIL = process.env.OPS_CADDY_EMAIL ?? `admin@${BASE_DOMAIN}`;
/** VPS dont le name == cette valeur est considere comme "local" : pas de SSH,
 *  on push direct sur l'admin API Caddy via CADDY_ADMIN_URL. */
const SELF_VPS_NAME = process.env.OPS_SELF_VPS_NAME ?? 'self';

interface ReconcileResult {
  vpsId: string;
  vpsName: string;
  isSelf: boolean;
  tenantCount: number;
  tenants: Array<{ slug: string; isMain: boolean; isFrozen: boolean }>;
}

/**
 * Reconciliation manuelle de Caddy : reconstruit la config complete depuis
 * la BDD et la pousse sur chaque VPS qui heberge au moins un tenant ACTIVE
 * ou FROZEN. Utile :
 *   - apres un seed du tenant principal (premier boot)
 *   - quand un changement Caddy s'est desynchronise (admin manuel + drift)
 *   - pour forcer une reissuance de cert apres changement DNS
 *
 * Idempotent : appeler N fois donne le meme etat.
 */
@injectable()
export class ReconcileCaddyUseCase {
  constructor(
    @inject(CADDY_SERVICE) private caddy: CaddyService,
    @inject(SSH_SERVICE) private ssh: SSHService,
  ) {}

  async execute(vpsId?: string): Promise<ReconcileResult[]> {
    // Cibler tous les VPS qui ont au moins 1 tenant non-archive, ou un VPS precis.
    const vpsList = vpsId
      ? await prisma.vPS.findMany({ where: { id: vpsId } })
      : await prisma.vPS.findMany({ where: { status: { not: 'DECOMMISSIONED' } } });

    if (vpsList.length === 0) {
      throw new BusinessError('Aucun VPS a reconcilier (BDD vide ?).');
    }

    const results: ReconcileResult[] = [];

    for (const vps of vpsList) {
      const tenants = await prisma.tenant.findMany({
        where: {
          vpsId: vps.id,
          status: { in: ['ACTIVE', 'PROVISIONING', 'FROZEN'] },
        },
      });

      const entries: TenantCaddyEntry[] = tenants
        .filter((t) => t.apiPort && t.webPort)
        .map((t) => ({
          slug: t.slug,
          customDomain: t.customDomain,
          apiPort: t.apiPort!,
          webPort: t.webPort!,
          webClientPort: t.webClientPort ?? undefined,
          isFrozen: t.status === 'FROZEN',
          isMain: (t as { isMain?: boolean }).isMain ?? false,
        }));

      const configJson = this.caddy.buildConfig(entries, {
        baseDomain: BASE_DOMAIN,
        email: CADDY_EMAIL,
      });

      const isSelf = vps.name === SELF_VPS_NAME;
      if (isSelf) {
        // VPS local : push direct via HTTP local (Docker bridge ou network=host).
        await this.caddy.pushLocal(configJson);
      } else {
        const creds: SshConnection = {
          host: vps.host,
          port: vps.port,
          username: vps.username,
          sshKeyEncrypted: vps.sshKeyEncrypted,
        };
        await this.caddy.push(creds, configJson);
      }

      results.push({
        vpsId: vps.id,
        vpsName: vps.name,
        isSelf,
        tenantCount: entries.length,
        tenants: entries.map((e) => ({
          slug: e.slug,
          isMain: e.isMain ?? false,
          isFrozen: e.isFrozen,
        })),
      });
    }

    return results;
  }
}
