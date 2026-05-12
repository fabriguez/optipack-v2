import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import {
  ReleaseUseCases,
  createReleaseSchema,
  updateReleaseSchema,
} from '../../application/use-cases/release/ReleaseUseCases';
import {
  RequestUpdateUseCase,
  requestUpdateSchema,
} from '../../application/use-cases/release/RequestUpdateUseCase';
import { AuditLogger } from '../../application/services/AuditLogger';
import { AuthenticationError } from '../../domain/errors/BusinessError';
import { parsePagination, paginated } from '../../application/utils/pagination';

export class ReleaseController {
  // ---------- Releases (super-admin) ----------

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const p = parsePagination(req);
      const isPublished =
        req.query.published === 'true' ? true : req.query.published === 'false' ? false : undefined;
      const { items, total } = await container.resolve(ReleaseUseCases).list({
        isPublished,
        q: p.q,
        page: p.page,
        pageSize: p.pageSize,
      });
      res.json({ success: true, ...paginated(items, total, p.page, p.pageSize) });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createReleaseSchema.parse(req.body);
      const item = await container.resolve(ReleaseUseCases).create(parsed);
      await container.resolve(AuditLogger).log(req, {
        action: 'RELEASE_CREATED',
        entityType: 'Release',
        entityId: item.id,
        payload: { version: item.version },
      });
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateReleaseSchema.parse(req.body);
      const item = await container.resolve(ReleaseUseCases).update(req.params.id, parsed);
      await container.resolve(AuditLogger).log(req, {
        action: 'RELEASE_UPDATED',
        entityType: 'Release',
        entityId: req.params.id,
        payload: parsed as Record<string, unknown>,
      });
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async publish(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.opsAdmin) throw new AuthenticationError();
      const item = await container.resolve(ReleaseUseCases).publish(req.params.id, req.opsAdmin.sub);
      await container.resolve(AuditLogger).log(req, {
        action: 'RELEASE_PUBLISHED',
        entityType: 'Release',
        entityId: req.params.id,
        payload: { version: item.version, isCritical: item.isCritical },
      });
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  // ---------- Tenant updates ----------

  /** POST /ops/tenants/:id/updates — declenche un update tenant (ops_admin / tenant_owner) */
  static async requestUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = requestUpdateSchema.parse(req.body);
      const job = await container.resolve(RequestUpdateUseCase).request(req.params.id, parsed);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_UPDATE_REQUESTED',
        entityType: 'Tenant',
        entityId: req.params.id,
        payload: { toVersion: parsed.toVersion, scheduledFor: parsed.scheduledFor },
      });
      res.status(201).json({ success: true, data: job });
    } catch (err) {
      next(err);
    }
  }

  static async listJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const jobs = await container.resolve(RequestUpdateUseCase).listJobs(req.params.id, limit);
      res.json({ success: true, data: jobs });
    } catch (err) {
      next(err);
    }
  }

  static async getJob(req: Request, res: Response, next: NextFunction) {
    try {
      const job = await container.resolve(RequestUpdateUseCase).getJob(req.params.jobId);
      res.json({ success: true, data: job });
    } catch (err) {
      next(err);
    }
  }

  static async rollback(req: Request, res: Response, next: NextFunction) {
    try {
      const job = await container.resolve(RequestUpdateUseCase).requestRollback(req.params.jobId);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_UPDATE_ROLLBACK_REQUESTED',
        entityType: 'TenantUpdateJob',
        entityId: req.params.jobId,
      });
      res.json({ success: true, data: job });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /ops/tenant-system/updates?tenantId=...
   * Endpoint utilise par l'API tenant pour proxier les infos update vers son frontend.
   * Auth : service token partage (`OPS_TENANT_PROXY_TOKEN`) ; pas un JWT ops admin.
   */
  static async tenantSystemSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.query.tenantId as string;
      if (!tenantId) {
        return res.status(400).json({ success: false, message: 'tenantId requis' });
      }
      const releases = container.resolve(ReleaseUseCases);
      const requests = container.resolve(RequestUpdateUseCase);
      const latest = await releases.latestPublished({ stableOnly: true });
      const recent = await requests.listJobs(tenantId, 5);
      // currentVersion lu sur le tenant
      const { prisma } = await import('../../config/database');
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { currentVersion: true, pinnedVersion: true, autoUpdatePolicy: true },
      });
      res.json({
        success: true,
        data: {
          currentVersion: tenant?.currentVersion ?? null,
          pinnedVersion: tenant?.pinnedVersion ?? null,
          autoUpdatePolicy: tenant?.autoUpdatePolicy ?? 'MANUAL',
          latestVersion: latest?.version ?? null,
          changelog: latest?.changelog ?? null,
          isCritical: latest?.isCritical ?? false,
          hasUpdate: !!(latest && latest.version !== tenant?.currentVersion),
          recentJobs: recent,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
