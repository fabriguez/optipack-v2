import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { logger } from '../../../infrastructure/logger';
import { SSHService, SSH_SERVICE, type SshConnection } from '../../../infrastructure/ssh/SSHService';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

const RETENTION_DAYS = 30;
const BACKUP_ROOT = '/var/lib/optipack/backups';

/**
 * Phase 5 — Backups nightly per-tenant.
 *
 * Strategie v1 : pg_dump sur le VPS source, fichier laisse sur le disque du VPS.
 * Stockage : `<BACKUP_ROOT>/tenant-<slug>/<timestamp>.dump`
 * Retention : 30 jours. Le cleanup supprime les .dump expires + leurs records.
 *
 * Tech-debt #31 : pousser vers MinIO control plane pour resilience cross-VPS.
 */
@injectable()
export class BackupTenantUseCase {
  constructor(@inject(SSH_SERVICE) private ssh: SSHService) {}

  async backupOne(tenantId: string, kind: 'nightly' | 'manual' | 'pre-update' = 'nightly'): Promise<string> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { vps: true },
    });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    if (!tenant.vps) throw new BusinessError('Tenant sans VPS');
    if (!tenant.dbName) throw new BusinessError('Tenant sans dbName');

    const creds: SshConnection = {
      host: tenant.vps.host,
      port: tenant.vps.port,
      username: tenant.vps.username,
      sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
    };

    const ts = Date.now();
    const dir = `${BACKUP_ROOT}/tenant-${tenant.slug}`;
    const path = `${dir}/${ts}.dump`;
    const pgName = `tenant-${tenant.slug}-postgres`;

    await this.ssh.exec(creds, `mkdir -p ${dir}`);
    const dump = await this.ssh.exec(
      creds,
      `docker exec ${pgName} pg_dump -U \${POSTGRES_USER:-postgres} -F c "${tenant.dbName}" > ${path}`,
    );
    if (dump.code !== 0) {
      const err = dump.stderr || 'pg_dump failed';
      await prisma.tenantBackup.create({
        data: {
          tenantId,
          vpsId: tenant.vpsId,
          storageRef: `vps:${path}`,
          kind,
          status: 'failed',
          errorLog: err.slice(0, 4000),
        },
      });
      throw new Error(`pg_dump failed for ${tenant.slug}: ${err}`);
    }

    // Recupere la taille (best-effort)
    const sizeRes = await this.ssh.exec(creds, `stat -c%s ${path} 2>/dev/null || stat -f%z ${path}`);
    const size = sizeRes.code === 0 ? Number(sizeRes.stdout.trim()) : null;

    const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const record = await prisma.tenantBackup.create({
      data: {
        tenantId,
        vpsId: tenant.vpsId,
        storageRef: `vps:${path}`,
        sizeBytes: size && !Number.isNaN(size) ? BigInt(size) : null,
        kind,
        status: 'succeeded',
        expiresAt,
      },
    });
    return record.id;
  }

  async cleanupExpired(): Promise<{ deleted: number }> {
    const expired = await prisma.tenantBackup.findMany({
      where: { expiresAt: { lt: new Date() }, status: 'succeeded' },
    });
    let deleted = 0;
    for (const b of expired) {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: b.tenantId },
          include: { vps: true },
        });
        if (tenant?.vps && b.storageRef.startsWith('vps:')) {
          const path = b.storageRef.replace(/^vps:/, '');
          await this.ssh.exec(
            {
              host: tenant.vps.host,
              port: tenant.vps.port,
              username: tenant.vps.username,
              sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
            },
            `rm -f ${path}`,
          );
        }
        await prisma.tenantBackup.delete({ where: { id: b.id } });
        deleted++;
      } catch (err) {
        logger.warn(
          { backupId: b.id, err: err instanceof Error ? err.message : String(err) },
          '[backup] cleanup failed',
        );
      }
    }
    return { deleted };
  }

  async runNightly(): Promise<{ total: number; ok: number; failed: number }> {
    const tenants = await prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'FROZEN'] } },
      select: { id: true, slug: true },
    });
    let ok = 0;
    let failed = 0;
    for (const t of tenants) {
      try {
        await this.backupOne(t.id, 'nightly');
        ok++;
      } catch (err) {
        failed++;
        logger.error(
          { tenantId: t.id, slug: t.slug, err: err instanceof Error ? err.message : String(err) },
          '[backup] nightly failed',
        );
      }
    }
    const cleanup = await this.cleanupExpired();
    logger.info({ total: tenants.length, ok, failed, cleaned: cleanup.deleted }, '[backup] nightly done');
    return { total: tenants.length, ok, failed };
  }

  async list(tenantId: string) {
    return prisma.tenantBackup.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async restore(backupId: string): Promise<void> {
    const backup = await prisma.tenantBackup.findUnique({ where: { id: backupId } });
    if (!backup) throw new NotFoundError('TenantBackup', backupId);
    if (backup.status !== 'succeeded') throw new BusinessError('Backup non utilisable');
    if (!backup.storageRef.startsWith('vps:')) {
      throw new BusinessError('Restore depuis MinIO pas encore implemente');
    }
    const tenant = await prisma.tenant.findUnique({
      where: { id: backup.tenantId },
      include: { vps: true },
    });
    if (!tenant?.vps || !tenant.dbName) throw new BusinessError('Tenant invalide');

    const path = backup.storageRef.replace(/^vps:/, '');
    const creds: SshConnection = {
      host: tenant.vps.host,
      port: tenant.vps.port,
      username: tenant.vps.username,
      sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
    };
    const res = await this.ssh.exec(
      creds,
      `cat ${path} | docker exec -i postgres pg_restore -U \${POSTGRES_USER:-postgres} -d "${tenant.dbName}" --clean --if-exists`,
    );
    if (res.code !== 0) {
      throw new Error(`pg_restore failed: ${res.stderr}`);
    }
  }
}
