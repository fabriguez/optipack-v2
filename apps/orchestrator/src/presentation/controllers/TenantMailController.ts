import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { TenantMailUseCases } from '../../application/use-cases/mail/TenantMailUseCases';
import { AuditLogger } from '../../application/services/AuditLogger';
import { BusinessError } from '../../domain/errors/BusinessError';

/**
 * Recupere le tenantId depuis :id (route ops-admin) OU header/query (route
 * service-token).
 *
 * Bug : la version precedente s'appelait elle-meme (`resolveTenantId(req)`
 * au lieu de `req.params.id`) -> RangeError stack overflow sur chaque GET.
 * Toutes les requetes /ops/tenants/:id/mail crashaient en boucle.
 */
function resolveTenantId(req: Request): string {
  const fromParam = req.params.id as string | undefined;
  const fromHeader = req.headers['x-tenant-id'] as string | undefined;
  const fromQuery = req.query.tenantId as string | undefined;
  const id = fromParam ?? fromHeader ?? fromQuery;
  if (!id) throw new BusinessError('tenantId requis');
  return id;
}

export class TenantMailController {
  /** GET /ops/tenants/:id/mail — etat courant de la config mail */
  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await container.resolve(TenantMailUseCases).getOrInit(resolveTenantId(req));
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /ops/tenants/:id/mail/provision
   * Body: { customDomain?: string }
   * Cree le domaine d'envoi sur Resend et retourne les records DNS a publier.
   */
  static async provision(req: Request, res: Response, next: NextFunction) {
    try {
      const customDomain = (req.body?.customDomain as string | undefined)?.trim() || undefined;
      const data = await container
        .resolve(TenantMailUseCases)
        .provisionDomain(resolveTenantId(req), customDomain);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_MAIL_DOMAIN_PROVISIONED',
        entityType: 'Tenant',
        entityId: resolveTenantId(req),
        payload: { sendingDomain: data.sendingDomain, resendDomainId: data.resendDomainId },
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /ops/tenants/:id/mail/verify — demande a Resend de re-verifier le DNS.
   */
  static async verify(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await container.resolve(TenantMailUseCases).verifyDomain(resolveTenantId(req));
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_MAIL_DOMAIN_VERIFY',
        entityType: 'Tenant',
        entityId: resolveTenantId(req),
        payload: { status: data.resendStatus },
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /** POST /ops/tenants/:id/mail/refresh — re-fetch sans declencher verify. */
  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await container.resolve(TenantMailUseCases).refreshStatus(resolveTenantId(req));
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}
