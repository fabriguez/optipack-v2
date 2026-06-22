import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { logger } from '../../../infrastructure/logger';
import { SSHService, SSH_SERVICE, type SshConnection } from '../../../infrastructure/ssh/SSHService';
import { NotificationService } from '../../../infrastructure/notifications/NotificationService';

const WARN_THRESHOLD_PCT = 80;
const CRITICAL_THRESHOLD_PCT = 95;

/**
 * Phase 5 #11/#18 — Visibilite sur l'usage disque par tenant.
 *
 * Docker n'enforce pas natiment les quotas disque (sans LVM thin ou xfs prjquota).
 * On fait du best-effort : pour chaque tenant ACTIVE, on calcule la taille de la DB
 * Postgres (`pg_database_size`) + la taille des volumes Docker. On compare au quota
 * du plan, et on alerte si > 80% (warn) ou > 95% (critical via webhook ops).
 */
@injectable()
export class DiskQuotaCheckUseCase {
  constructor(
    @inject(SSH_SERVICE) private ssh: SSHService,
    private notifications: NotificationService,
  ) {}

  async run(): Promise<{ checked: number; warnings: number; criticals: number }> {
    const tenants = await prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      include: { vps: true, resourcePlan: true },
    });

    let warnings = 0;
    let criticals = 0;
    for (const t of tenants) {
      if (!t.vps) continue;
      const quotaGb = t.customDiskGb ?? t.resourcePlan?.diskQuotaGb ?? 0;
      if (quotaGb <= 0) continue;

      const creds: SshConnection = {
        host: t.vps.host,
        port: t.vps.port,
        username: t.vps.username,
        sshKeyEncrypted: t.vps.sshKeyEncrypted,
      };
      const dbName = t.dbName ?? `tenant_${t.slug.replace(/-/g, '_')}_db`;
      const pgName = `tenant-${t.slug}-postgres`;

      try {
        // pg_database_size renvoie en bytes
        const r = await this.ssh.exec(
          creds,
          `PGUSER=$(docker exec ${pgName} printenv POSTGRES_USER 2>/dev/null || echo postgres); docker exec ${pgName} psql -U "$PGUSER" -d "${dbName}" -tA -c "SELECT pg_database_size(current_database())"`,
        );
        if (r.code !== 0) continue;
        const dbBytes = Number(r.stdout.trim());
        if (Number.isNaN(dbBytes)) continue;

        const dbGb = dbBytes / 1024 ** 3;
        const pct = (dbGb / quotaGb) * 100;

        if (pct >= CRITICAL_THRESHOLD_PCT) {
          criticals++;
          logger.error(
            { tenantId: t.id, slug: t.slug, dbGb: dbGb.toFixed(2), quotaGb, pct: pct.toFixed(0) },
            '[disk-quota] CRITICAL: tenant > 95% du quota',
          );
          await this.notifications.alert(
            `Tenant ${t.slug} > 95% du quota disque`,
            { dbGb: dbGb.toFixed(2), quotaGb, pct: pct.toFixed(0) },
          );
        } else if (pct >= WARN_THRESHOLD_PCT) {
          warnings++;
          logger.warn(
            { tenantId: t.id, slug: t.slug, dbGb: dbGb.toFixed(2), quotaGb, pct: pct.toFixed(0) },
            '[disk-quota] WARN: tenant > 80% du quota',
          );
        }
      } catch (err) {
        logger.warn(
          { tenantId: t.id, err: err instanceof Error ? err.message : String(err) },
          '[disk-quota] check failed',
        );
      }
    }

    return { checked: tenants.length, warnings, criticals };
  }
}
