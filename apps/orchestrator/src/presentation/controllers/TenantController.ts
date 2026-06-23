import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { container } from '../../container';
import {
  TenantUseCases,
  createTenantSchema,
  updateTenantSchema,
} from '../../application/use-cases/tenant/TenantUseCases';
import { AuditLogger } from '../../application/services/AuditLogger';
import { parsePagination, paginated } from '../../application/utils/pagination';
import { prisma } from '../../config/database';
import { BusinessError } from '../../domain/errors/BusinessError';

/**
 * Studio "tenant-self" : champs que le proprietaire d'un tenant peut editer
 * via son propre frontend (proxy depuis l'API tenant avec service token).
 * Exclut tout ce qui touche au status, vps, slug, ports, ownerEmail.
 */
const tenantSelfStudioSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logoUrl: z.string().url().optional().nullable(),
  enabledModules: z.array(z.string()).optional(),
  customDomain: z.string().optional().nullable(),
  autoUpdatePolicy: z.enum(['MANUAL', 'AUTO_STABLE', 'AUTO_CRITICAL_ONLY']).optional(),
  pinnedVersion: z.string().optional().nullable(),
  name: z.string().min(2).optional(),
  skinId: z.string().nullable().optional(),
  skinCustomization: z.any().nullable().optional(),
});

export class TenantController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createTenantSchema.parse(req.body);
      const tenant = await container.resolve(TenantUseCases).create(parsed);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_CREATED',
        entityType: 'Tenant',
        entityId: tenant.id,
        payload: { slug: tenant.slug, vpsId: tenant.vpsId, ownerEmail: tenant.ownerEmail },
      });
      res.status(201).json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const p = parsePagination(req);
      const { items, total } = await container.resolve(TenantUseCases).list({
        status: req.query.status as string | undefined,
        vpsId: req.query.vpsId as string | undefined,
        q: p.q,
        page: p.page,
        pageSize: p.pageSize,
      });
      res.json({ success: true, ...paginated(items, total, p.page, p.pageSize) });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = await container.resolve(TenantUseCases).getById(req.params.id);
      res.json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /ops/tenant-self/studio?tenantId=...
   * Lit la config "Studio" pour le tenant donne. Auth : service token (proxy
   * depuis l'API tenant qui passe son propre orgId).
   * Champs : theming + modules + domain + update policy + pinned version + name.
   */
  static async getSelfStudio(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req.query.tenantId ?? req.headers['x-tenant-id']) as string | undefined;
      if (!tenantId) throw new BusinessError('tenantId requis (query ou header X-Tenant-Id)');
      const t = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          slug: true,
          name: true,
          customDomain: true,
          enabledModules: true,
          logoUrl: true,
          primaryColor: true,
          secondaryColor: true,
          accentColor: true,
          autoUpdatePolicy: true,
          pinnedVersion: true,
          status: true,
          skinId: true,
          skinCustomization: true,
        } as any,
      });
      if (!t) throw new BusinessError('Tenant introuvable');
      res.json({ success: true, data: t });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /ops/tenant-self/studio?tenantId=...
   * Met a jour les champs "Studio" autorises au proprietaire (pas de status,
   * pas de vps, pas de ports). Audit avec acteur "tenant_owner".
   */
  static async patchSelfStudio(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req.query.tenantId ?? req.headers['x-tenant-id']) as string | undefined;
      if (!tenantId) throw new BusinessError('tenantId requis');
      const parsed = tenantSelfStudioSchema.parse(req.body);
      const updated = await container.resolve(TenantUseCases).update(tenantId, parsed);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_STUDIO_UPDATED_BY_OWNER',
        entityType: 'Tenant',
        entityId: tenantId,
        payload: { fields: Object.keys(parsed) },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateTenantSchema.parse(req.body);
      const tenant = await container.resolve(TenantUseCases).update(req.params.id, parsed);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_UPDATED',
        entityType: 'Tenant',
        entityId: req.params.id,
        payload: parsed as Record<string, unknown>,
      });
      res.json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  }

  static async freeze(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = await container.resolve(TenantUseCases).freeze(req.params.id);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_FREEZED',
        entityType: 'Tenant',
        entityId: req.params.id,
      });
      res.json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  }

  static async unfreeze(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = await container.resolve(TenantUseCases).unfreeze(req.params.id);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_UNFREEZED',
        entityType: 'Tenant',
        entityId: req.params.id,
      });
      res.json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  }

  static async archive(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = await container.resolve(TenantUseCases).archive(req.params.id);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_ARCHIVED',
        entityType: 'Tenant',
        entityId: req.params.id,
      });
      res.json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /ops/tenants/:id/containers -- liste les containers du stack tenant
   * (api, web, web-client, postgres, redis, minio) avec etat + status.
   */
  static async containers(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await container.resolve(TenantUseCases).listContainers(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /ops/tenants/:id/containers/:name/logs?tail=200 -- docker logs.
   */
  static async containerLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const tail = Number(req.query.tail ?? 200);
      const data = await container
        .resolve(TenantUseCases)
        .containerLogs(req.params.id, req.params.name, Number.isFinite(tail) ? tail : 200);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /ops/tenants/:id/containers/:name/exec  body={cmd}
   * Exec one-shot dans le container. Timeout 30s. Output combine stdout+stderr.
   */
  static async containerExec(req: Request, res: Response, next: NextFunction) {
    try {
      const cmd = (req.body?.cmd as string | undefined)?.trim();
      if (!cmd) {
        res.status(400).json({ success: false, message: 'cmd requis' });
        return;
      }
      const data = await container
        .resolve(TenantUseCases)
        .containerExec(req.params.id, req.params.name, cmd);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_CONTAINER_EXEC',
        entityType: 'Tenant',
        entityId: req.params.id,
        payload: { container: req.params.name, cmd: cmd.slice(0, 200) } as Record<string, unknown>,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async stackStop(req: Request, res: Response, next: NextFunction) {
    try {
      await container.resolve(TenantUseCases).stackStop(req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  static async stackStart(req: Request, res: Response, next: NextFunction) {
    try {
      await container.resolve(TenantUseCases).stackStart(req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  static async stackRestart(req: Request, res: Response, next: NextFunction) {
    try {
      await container.resolve(TenantUseCases).stackRestart(req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /ops/tenants/:id/reset-owner-password -- regenere le pwd owner
   * (SUPER_ADMIN du tenant) + retourne email + plaintext one-shot.
   * Audit log capture seulement la date + email, JAMAIS la pwd.
   */
  static async resetOwnerPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await container.resolve(TenantUseCases).resetOwnerPassword(req.params.id);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_OWNER_PASSWORD_RESET',
        entityType: 'Tenant',
        entityId: req.params.id,
        payload: { email: result.email } as Record<string, unknown>,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /** GET /ops/tenants/:id/billing-user -- infos du compte facturation tenant. */
  static async getBillingUser(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await container.resolve(TenantUseCases).getBillingUser(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /ops/tenants/:id/billing-user -- (re)genere le compte facturation
   * tenant + retourne email + mot de passe one-shot. Email optionnel (defaut =
   * ownerEmail du tenant). Reserve super-admin.
   */
  static async resetBillingUser(req: Request, res: Response, next: NextFunction) {
    try {
      const email = (req.body?.email as string | undefined)?.trim() || undefined;
      const result = await container.resolve(TenantUseCases).resetBillingUser(req.params.id, email);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_BILLING_USER_RESET',
        entityType: 'Tenant',
        entityId: req.params.id,
        payload: { email: result.email, created: result.created } as Record<string, unknown>,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /ops/tenants/:id/purge -- destruction physique COMPLETE
   * (containers + volumes + images locales + network + env files + record
   * tenant). Aucun retour en arriere. Reserve super-admin.
   */
  static async purge(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await container.resolve(TenantUseCases).purge(req.params.id);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_PURGED',
        entityType: 'Tenant',
        entityId: req.params.id,
        payload: { slug: result.slug, jobId: result.jobId } as Record<string, unknown>,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async migrate(req: Request, res: Response, next: NextFunction) {
    try {
      const targetVpsId = req.body?.targetVpsId as string | undefined;
      if (!targetVpsId) {
        res.status(400).json({ success: false, message: 'targetVpsId requis' });
        return;
      }
      const tenant = await container.resolve(TenantUseCases).migrate(req.params.id, targetVpsId);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_MIGRATE_REQUESTED',
        entityType: 'Tenant',
        entityId: req.params.id,
        payload: { targetVpsId },
      });
      res.json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  }

  static async listJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const items = await container.resolve(TenantUseCases).listJobs(req.params.id, limit);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  /** Detail d'un job + logs complets (pour streaming temps reel via polling). */
  static async getJob(req: Request, res: Response, next: NextFunction) {
    try {
      const job = await container
        .resolve(TenantUseCases)
        .getJob(req.params.id!, req.params.jobId!);
      res.json({ success: true, data: job });
    } catch (err) {
      next(err);
    }
  }

  static async getLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await container.resolve(TenantUseCases).getLogs(req.params.id, {
        tail: req.query.tail ? Number(req.query.tail) : 200,
        service: (req.query.service as 'api' | 'web' | undefined) ?? 'api',
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
