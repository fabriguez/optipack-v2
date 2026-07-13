import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { container } from '../../container';
import { prisma } from '../../config/database';
import { siteDeployQueue } from '../../infrastructure/queue/queues';
import { SshKeyEncryption } from '../../infrastructure/crypto/SshKeyEncryption';
import { AuditLogger } from '../../application/services/AuditLogger';
import { DockerService, DOCKER_SERVICE } from '../../infrastructure/docker/DockerService';
import { ReconcileCaddyUseCase } from '../../application/use-cases/caddy/ReconcileCaddyUseCase';
import { NotFoundError } from '../../domain/errors/BusinessError';

const BASE_DOMAIN = process.env.OPS_BASE_DOMAIN ?? 'transitsoftservices.com';

// Accepte HTTPS (https://…) OU SSH (ssh://… ou forme scp git@host:org/repo.git).
const REPO_URL_RE = /^(https?:\/\/|ssh:\/\/|[A-Za-z0-9._-]+@[^/]+:)/;

const configureSchema = z.object({
  repoUrl: z
    .string()
    .min(1)
    .refine((v) => REPO_URL_RE.test(v.trim()), {
      message: 'URL de repo invalide (https://… ou git@host:org/repo.git)',
    }),
  branch: z.string().min(1).default('main'),
  dockerfilePath: z.string().min(1).default('Dockerfile'),
  buildContext: z.string().optional().nullable(),
  containerPort: z.number().int().positive().default(3000),
  healthPath: z.string().min(1).default('/'),
  cpuLimit: z.number().positive().max(8).default(0.5),
  memoryMb: z.number().int().positive().max(16384).default(512),
  autoDeploy: z.boolean().default(true),
  // Secrets : optionnels ; chiffrés avant stockage. Vide = inchangé.
  repoToken: z.string().optional().nullable(),
  // Clé privée SSH de déploiement (repos SSH). Vide = inchangé.
  repoSshKey: z.string().optional().nullable(),
  envVars: z.record(z.string()).optional().nullable(),
});

/** Renvoie true si `tenant-<slug>-site` prend les hosts publics. Sert au front. */
function webhookUrlFor(tenantId: string): string {
  const base = process.env.OPS_PUBLIC_API_URL ?? `https://ops.${BASE_DOMAIN}`;
  return `${base}/ops/webhooks/github/site/${tenantId}`;
}

export class SiteController {
  /** GET /ops/tenants/:id/site — config (secrets masqués) + derniers déploiements. */
  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.params.id;
      const site = await prisma.tenantSite.findUnique({ where: { tenantId } });
      if (!site) {
        res.json({ success: true, data: null });
        return;
      }
      const jobs = await prisma.siteDeployJob.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      res.json({
        success: true,
        data: {
          ...SiteController.publicView(site),
          webhookUrl: webhookUrlFor(tenantId),
          deployJobs: jobs,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /** PUT /ops/tenants/:id/site — crée/met à jour la config du site custom. */
  static async configure(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.params.id;
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
      if (!tenant) throw new NotFoundError('Tenant', tenantId);
      const parsed = configureSchema.parse(req.body);

      const existing = await prisma.tenantSite.findUnique({ where: { tenantId } });
      // Secret webhook : généré une fois, conservé ensuite (l'URL/secret reste
      // stable côté GitHub entre deux reconfigurations).
      const webhookSecret = existing?.webhookSecret ?? randomBytes(24).toString('hex');

      // Secrets : seulement (ré)écrits si fournis. Envoyer null explicite pour effacer.
      const repoTokenEnc =
        parsed.repoToken === undefined
          ? existing?.repoTokenEnc ?? null
          : parsed.repoToken
            ? SshKeyEncryption.encrypt(parsed.repoToken)
            : null;
      const repoSshKeyEnc =
        parsed.repoSshKey === undefined
          ? existing?.repoSshKeyEnc ?? null
          : parsed.repoSshKey
            ? SshKeyEncryption.encrypt(parsed.repoSshKey)
            : null;
      const envVarsEnc =
        parsed.envVars === undefined
          ? existing?.envVarsEnc ?? null
          : parsed.envVars
            ? SshKeyEncryption.encrypt(JSON.stringify(parsed.envVars))
            : null;

      const data = {
        repoUrl: parsed.repoUrl,
        branch: parsed.branch,
        dockerfilePath: parsed.dockerfilePath,
        buildContext: parsed.buildContext ?? null,
        containerPort: parsed.containerPort,
        healthPath: parsed.healthPath,
        cpuLimit: parsed.cpuLimit,
        memoryMb: parsed.memoryMb,
        autoDeploy: parsed.autoDeploy,
        repoTokenEnc,
        repoSshKeyEnc,
        envVarsEnc,
        webhookSecret,
      };

      const site = await prisma.tenantSite.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: data,
      });

      await container.resolve(AuditLogger).log(req, {
        action: existing ? 'TENANT_SITE_UPDATED' : 'TENANT_SITE_CONFIGURED',
        entityType: 'TenantSite',
        entityId: tenantId,
        payload: { repoUrl: parsed.repoUrl, branch: parsed.branch },
      });

      // Le secret n'est renvoyé QU'ICI (config), en clair, pour être collé dans
      // les réglages webhook GitHub. get() ne le réexpose jamais.
      res.status(existing ? 200 : 201).json({
        success: true,
        data: {
          ...SiteController.publicView(site),
          webhookUrl: webhookUrlFor(tenantId),
          webhookSecret,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /** POST /ops/tenants/:id/site/redeploy — déclenche un build manuel. */
  static async redeploy(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.params.id;
      const site = await prisma.tenantSite.findUnique({ where: { tenantId }, select: { tenantId: true } });
      if (!site) throw new NotFoundError('TenantSite', tenantId);
      await SiteController.enqueue(tenantId, 'manual');
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_SITE_REDEPLOY',
        entityType: 'TenantSite',
        entityId: tenantId,
      });
      res.status(202).json({ success: true, data: { queued: true } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /ops/tenants/:id/site/webhook/regenerate — génère un nouveau secret
   * HMAC (invalide l'ancien). Le secret n'est renvoyé qu'ici, en clair.
   */
  static async regenerateWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.params.id;
      const existing = await prisma.tenantSite.findUnique({ where: { tenantId }, select: { tenantId: true } });
      if (!existing) throw new NotFoundError('TenantSite', tenantId);
      const webhookSecret = randomBytes(24).toString('hex');
      await prisma.tenantSite.update({ where: { tenantId }, data: { webhookSecret } });
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_SITE_WEBHOOK_REGENERATED',
        entityType: 'TenantSite',
        entityId: tenantId,
      });
      res.json({ success: true, data: { webhookUrl: webhookUrlFor(tenantId), webhookSecret } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /ops/tenants/:id/site — démonte le site custom : stoppe le projet
   * compose dédié, supprime la config, puis reconcile Caddy (les hosts publics
   * repassent au web-client standard).
   */
  static async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.params.id;
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { vps: true, site: true },
      });
      if (!tenant?.site) throw new NotFoundError('TenantSite', tenantId);

      if (tenant.vps) {
        const docker = container.resolve<DockerService>(DOCKER_SERVICE);
        const composeFilePath = `${process.env.OPS_TENANT_ENV_DIR ?? '/home/brightky/.optipack'}/tenant-${tenant.slug}-site-compose.yml`;
        const projectName = `tenant-${tenant.slug}-site`;
        // best-effort : down du projet compose dédié (containers + réseau).
        await docker
          .composeStop({ host: tenant.vps.host, port: tenant.vps.port, username: tenant.vps.username, sshKeyEncrypted: tenant.vps.sshKeyEncrypted }, composeFilePath, projectName)
          .catch(() => {/* déjà arrêté */});
      }

      await prisma.tenantSite.delete({ where: { tenantId } });
      // Reconcile : le mapper ne verra plus de site live -> hosts publics
      // repassent au web-client.
      if (tenant.vps) {
        await container.resolve(ReconcileCaddyUseCase).execute({ vpsId: tenant.vpsId }).catch(() => {/* non bloquant */});
      }
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_SITE_REMOVED',
        entityType: 'TenantSite',
        entityId: tenantId,
      });
      res.json({ success: true, data: { removed: true } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /ops/webhooks/github/site/:tenantId — auto-deploy sur push GitHub.
   * PUBLIC (pas d'auth ops) : la légitimité est prouvée par la signature HMAC
   * `X-Hub-Signature-256` calculée avec le webhookSecret du site. Body brut requis.
   */
  static async webhook(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.params.tenantId;
      const site = await prisma.tenantSite.findUnique({ where: { tenantId } });
      if (!site) {
        res.status(404).json({ success: false, message: 'site inconnu' });
        return;
      }

      // req.body est un Buffer (route montée avec raw()).
      const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      const signature = req.header('x-hub-signature-256') ?? '';
      if (!SiteController.verifyGithubSignature(raw, signature, site.webhookSecret)) {
        res.status(401).json({ success: false, message: 'signature invalide' });
        return;
      }

      const event = req.header('x-github-event') ?? '';
      if (event === 'ping') {
        res.json({ success: true, data: { pong: true } });
        return;
      }
      if (event !== 'push') {
        res.json({ success: true, data: { ignored: `event=${event}` } });
        return;
      }

      // GitHub envoie soit application/json (body = JSON), soit
      // application/x-www-form-urlencoded (body = "payload=<json url-encodé>").
      // La signature HMAC est calculée sur le body BRUT dans les deux cas (déjà
      // vérifiée ci-dessus) ; ici on extrait le JSON pour lire `ref`.
      const contentType = (req.header('content-type') ?? '').toLowerCase();
      let jsonStr = raw.toString('utf8');
      if (contentType.includes('application/x-www-form-urlencoded')) {
        jsonStr = new URLSearchParams(jsonStr).get('payload') ?? '';
      }
      let payload: { ref?: string } = {};
      try {
        payload = JSON.parse(jsonStr) as { ref?: string };
      } catch {
        res.status(400).json({ success: false, message: 'payload JSON invalide' });
        return;
      }

      // Filtre branche : ne déploie que sur la branche configurée.
      if (payload.ref && payload.ref !== `refs/heads/${site.branch}`) {
        res.json({ success: true, data: { ignored: `ref=${payload.ref}` } });
        return;
      }
      if (!site.autoDeploy) {
        res.json({ success: true, data: { ignored: 'autoDeploy=false' } });
        return;
      }

      await SiteController.enqueue(tenantId, 'webhook');
      res.status(202).json({ success: true, data: { queued: true } });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------

  /** Enqueue avec jobId déterministe -> dédup des builds concurrents par tenant. */
  private static async enqueue(tenantId: string, trigger: 'manual' | 'webhook'): Promise<void> {
    await siteDeployQueue.add('deploy', { tenantId, trigger }, { jobId: `site-deploy-${tenantId}` });
  }

  private static verifyGithubSignature(raw: Buffer, header: string, secret: string): boolean {
    if (!secret || !header.startsWith('sha256=')) return false;
    const provided = header.slice('sha256='.length);
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /** Vue publique du site : jamais de secret (token/env/webhookSecret). */
  private static publicView(site: {
    tenantId: string;
    repoUrl: string;
    branch: string;
    dockerfilePath: string;
    buildContext: string | null;
    containerPort: number;
    sitePort: number | null;
    healthPath: string;
    cpuLimit: number;
    memoryMb: number;
    status: string;
    autoDeploy: boolean;
    lastDeploySha: string | null;
    lastDeployAt: Date | null;
    lastError: string | null;
    repoTokenEnc: string | null;
    repoSshKeyEnc: string | null;
    envVarsEnc: string | null;
  }) {
    return {
      tenantId: site.tenantId,
      repoUrl: site.repoUrl,
      branch: site.branch,
      dockerfilePath: site.dockerfilePath,
      buildContext: site.buildContext,
      containerPort: site.containerPort,
      sitePort: site.sitePort,
      healthPath: site.healthPath,
      cpuLimit: site.cpuLimit,
      memoryMb: site.memoryMb,
      status: site.status,
      autoDeploy: site.autoDeploy,
      lastDeploySha: site.lastDeploySha,
      lastDeployAt: site.lastDeployAt,
      lastError: site.lastError,
      isSshRepo: REPO_URL_RE.test(site.repoUrl) && /^(ssh:\/\/|[A-Za-z0-9._-]+@[^/]+:)/.test(site.repoUrl),
      hasRepoToken: !!site.repoTokenEnc,
      hasRepoSshKey: !!site.repoSshKeyEnc,
      hasEnvVars: !!site.envVarsEnc,
    };
  }
}
