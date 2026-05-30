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

interface ReconcileFailure {
  vpsId: string;
  vpsName: string;
  reason: string;
  decommissioned: boolean;
}

interface ReconcileOptions {
  vpsId?: string;
  /** Si true : ne throw plus sur erreur VPS individuelle, retourne dans
   *  `failures`. Si en plus `markFailedAsDecommissioned` est true, le VPS
   *  est passe en status DECOMMISSIONED. Utilise au boot pour cleanup
   *  automatique des VPS dont SSH/Caddy admin ne repond plus. */
  collectFailures?: boolean;
  markFailedAsDecommissioned?: boolean;
}

export interface ReconcileBatchResult {
  results: ReconcileResult[];
  failures: ReconcileFailure[];
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

  async execute(arg?: string | ReconcileOptions): Promise<ReconcileResult[]> {
    // Compat ascendante : un string = vpsId (signature historique).
    const opts: ReconcileOptions =
      typeof arg === 'string' ? { vpsId: arg } : arg ?? {};
    const batch = await this.executeBatch(opts);
    return batch.results;
  }

  /**
   * Variante "batch" qui ne throw plus sur erreur d'un VPS individuel quand
   * `collectFailures` est true. Utilisee au boot pour reconciliation auto +
   * cleanup des VPS unreachable.
   */
  async executeBatch(opts: ReconcileOptions = {}): Promise<ReconcileBatchResult> {
    const vpsList = opts.vpsId
      ? await prisma.vPS.findMany({ where: { id: opts.vpsId } })
      : await prisma.vPS.findMany({ where: { status: { not: 'DECOMMISSIONED' } } });

    if (vpsList.length === 0) {
      if (opts.collectFailures) return { results: [], failures: [] };
      throw new BusinessError('Aucun VPS a reconcilier (BDD vide ?).');
    }

    const results: ReconcileResult[] = [];
    const failures: ReconcileFailure[] = [];

    for (const vps of vpsList) {
      try {
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
      } catch (err) {
        if (!opts.collectFailures) throw err;
        const reason = err instanceof Error ? err.message : String(err);
        let decommissioned = false;
        if (opts.markFailedAsDecommissioned) {
          try {
            await prisma.vPS.update({
              where: { id: vps.id },
              data: { status: 'DECOMMISSIONED' },
            });
            decommissioned = true;
          } catch {
            /* skip — le decommissioning best-effort ne doit pas bloquer le batch */
          }
        }
        failures.push({
          vpsId: vps.id,
          vpsName: vps.name,
          reason,
          decommissioned,
        });
      }
    }

    return { results, failures };
  }
}
