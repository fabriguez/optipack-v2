import 'reflect-metadata';
import './container';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { disconnectPrisma, prisma } from './config/database';
import { logger } from './infrastructure/logger';
import routes from './presentation/routes';
import { errorHandler } from './presentation/middleware/errorHandler';
import { requestContext } from './presentation/middleware/requestContext';
import { container } from './container';
import { MetricsService } from './infrastructure/metrics/MetricsService';
import { ReconcileCaddyUseCase } from './application/use-cases/caddy/ReconcileCaddyUseCase';
import { SSHService, SSH_SERVICE } from './infrastructure/ssh/SSHService';
import { startProvisioningWorkers, stopWorkers } from './infrastructure/queue/workers';
import { closeQueues } from './infrastructure/queue/queues';
import { redisConnection } from './infrastructure/queue/connection';
import {
  startMonitoringWorker,
  scheduleMonitoringJobs,
  closeMonitoring,
} from './infrastructure/queue/monitoring';
import type { Worker } from 'bullmq';
import { corsOptions } from './config/cors';

const app = express();

// Reverse-proxy (Caddy) en prod : confiance pour X-Forwarded-For (rate-limit + IP audit)
app.set('trust proxy', 1);

// Helmet : on durcit la CSP. L'orchestrateur sert uniquement du JSON, donc on bloque
// l'execution de scripts/styles inline et on whiteliste seulement les CDN absolument
// necessaires (aucun pour le moment cote API).
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // pas necessaire pour une API JSON
    referrerPolicy: { policy: 'no-referrer' },
  }),
);

// CORS centralise : allowlist par regex sur les sous-domaines de OPS_BASE_DOMAIN
// + OPS_CORS_ORIGINS / OPS_CORS_ORIGIN_PATTERNS pour les exceptions. Cf. ./config/cors.ts
app.use(cors(corsOptions));
// Reponse explicite aux preflight OPTIONS, pour couvrir les cas ou un autre
// middleware terminerait la requete avant cors() (rate-limit, 404 catch-all, etc).
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(requestContext);

// Tracking metriques HTTP (Phase 5 #28)
const metrics = container.resolve(MetricsService);
app.use((req, res, next) => {
  res.on('finish', () => metrics.trackHttp(req.method, res.statusCode));
  next();
});

// Endpoint /metrics (format Prometheus, sans auth — protege par firewall/network).
// Pour exposer publiquement : ajouter requireServiceToken ou IP allowlist.
app.get('/metrics', async (_req, res, next) => {
  try {
    const body = await metrics.render();
    res.type('text/plain; version=0.0.4').send(body);
  } catch (err) {
    next(err);
  }
});

// Rate limit serre sur l'auth (10 tentatives login / 15 min / IP).
// On skip les preflight OPTIONS pour ne pas consommer le quota -- le cors()
// middleware en amont les a deja gerees et y reponds avec les headers ACAO.
app.use(
  '/ops/auth/login',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
  }),
);
app.use(
  '/ops/auth/2fa',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
  }),
);

// Rate-limit ecriture sur les endpoints critiques (Phase 5 — #26).
// Whitelist : skip pour les webhooks (signatures) + lecture (GET).
const writeLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 ecritures / min / IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // OPTIONS = preflight CORS : jamais rate-limite (cors() y repond deja)
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true;
    if (req.path.startsWith('/billing/webhook')) return true;
    if (req.path.startsWith('/auth/login') || req.path.startsWith('/auth/2fa')) return true;
    return false;
  },
});
app.use('/ops', writeLimit);

app.use('/ops', routes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route introuvable' });
});

// Error handler en dernier
app.use(errorHandler);

// Demarrage HTTP + workers BullMQ
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, '[orchestrator] listening');
});

// Reconciliation Caddy au boot : reconstruit la config sur tous les VPS
// actifs depuis la BDD. Idempotent. Non bloquant : si echec global, on log
// et continue. Les VPS individuels injoignables (SSH/Caddy admin KO) sont
// automatiquement passes en status DECOMMISSIONED pour ne plus polluer les
// futures reconciliations. Override via env :
//   OPS_DISABLE_BOOT_RECONCILE=1    : skip totalement
//   OPS_BOOT_RECONCILE_KEEP_FAILED=1 : log les echecs sans decommissioning
const reconcileDisabled = process.env.OPS_DISABLE_BOOT_RECONCILE === '1';
const keepFailed = process.env.OPS_BOOT_RECONCILE_KEEP_FAILED === '1';
if (!reconcileDisabled) {
  setTimeout(() => {
    void (async () => {
      try {
        const useCase = container.resolve(ReconcileCaddyUseCase);
        const { results, failures } = await useCase.executeBatch({
          collectFailures: true,
          markFailedAsDecommissioned: !keepFailed,
        });
        logger.info(
          {
            vpsCount: results.length,
            tenants: results.reduce((s, r) => s + r.tenantCount, 0),
            failed: failures.length,
            decommissioned: failures.filter((f) => f.decommissioned).map((f) => ({
              vpsId: f.vpsId,
              vpsName: f.vpsName,
              reason: f.reason,
            })),
          },
          '[orchestrator] caddy boot reconcile done',
        );
        for (const f of failures) {
          logger.warn(
            { vpsId: f.vpsId, vpsName: f.vpsName, reason: f.reason, decommissioned: f.decommissioned },
            '[orchestrator] caddy reconcile failed for VPS',
          );
        }
      } catch (err) {
        logger.warn(
          { err: (err as Error).message },
          '[orchestrator] caddy boot reconcile failed (non-fatal)',
        );
      }
    })();
  }, 3000);
}

// Boot migration : injecte OPS_TENANT_PROXY_TOKEN dans le .env de tous les
// tenants actifs qui ne l'ont pas encore. Non bloquant. Idempotent (grep -q
// avant d'ecrire). Couvre les tenants provisiones avant ce fix.
// Override : OPS_DISABLE_TOKEN_SYNC=1
if (!process.env.OPS_DISABLE_TOKEN_SYNC) {
  const proxyToken = process.env.OPS_TENANT_PROXY_TOKEN ?? '';
  if (!proxyToken) {
    logger.warn('[orchestrator] OPS_TENANT_PROXY_TOKEN absent -- boot token-sync skip');
  } else {
    setTimeout(() => {
      void (async () => {
        try {
          const tenants = await prisma.tenant.findMany({
            where: { status: { in: ['ACTIVE', 'PROVISIONING'] } },
            include: { vps: true },
          });
          const ssh = container.resolve<SSHService>(SSH_SERVICE);
          const envDir = process.env.OPS_TENANT_ENV_DIR ?? '/home/brightky/.optipack';
          const escapedToken = proxyToken.replace(/'/g, "'\\''");
          let patched = 0;
          for (const t of tenants) {
            if (!t.vps) continue;
            const creds = {
              host: t.vps.host,
              port: t.vps.port,
              username: t.vps.username,
              sshKeyEncrypted: t.vps.sshKeyEncrypted,
            };
            const envFile = `${envDir}/tenant-${t.slug}.env`;
            const apiName = `tenant-${t.slug}-api`;
            const webName = `tenant-${t.slug}-web`;
            // Injecte OPS_TENANT_PROXY_TOKEN (requis pour ops-sync + reset-pwd)
            // et INTERNAL_API_URL (requis pour que NextAuth appelle l API via
            // reseau Docker interne, sans hairpin NAT / TLS / Caddy).
            const internalApiUrl = `http://${apiName}:4000/api/v1`;
            // URL publique de l'orchestrator pour les appels self-service du
            // tenant (system.routes). Le nom docker "orchestrator" n'est pas
            // resolvable sur un VPS tenant distant -> EAI_AGAIN. On force l'URL
            // publique. Couvre les tenants provisiones avant ce fix.
            const orchestratorUrl =
              process.env.OPS_PUBLIC_API_URL ??
              `https://ops.${process.env.OPS_BASE_DOMAIN ?? 'transitsoftservices.com'}`;
            const cmd = [
              `CHANGED=0`,
              `if ! grep -q "^OPS_TENANT_PROXY_TOKEN=" "${envFile}" 2>/dev/null; then`,
              `  printf 'OPS_TENANT_PROXY_TOKEN=%s\\n' '${escapedToken}' >> "${envFile}"`,
              `  CHANGED=1`,
              `fi`,
              `if ! grep -q "^INTERNAL_API_URL=" "${envFile}" 2>/dev/null; then`,
              `  printf 'INTERNAL_API_URL=%s\\n' '${internalApiUrl}' >> "${envFile}"`,
              `  CHANGED=1`,
              `fi`,
              // ORCHESTRATOR_URL : ajoute si absent, OU remplace une ancienne
              // valeur docker-name (orchestrator:4020) par l'URL publique.
              `if grep -q "^ORCHESTRATOR_URL=" "${envFile}" 2>/dev/null; then`,
              `  if grep -q "^ORCHESTRATOR_URL=http://orchestrator" "${envFile}" 2>/dev/null; then`,
              `    sed -i "s#^ORCHESTRATOR_URL=.*#ORCHESTRATOR_URL=${orchestratorUrl}#" "${envFile}"`,
              `    CHANGED=1`,
              `  fi`,
              `else`,
              `  printf 'ORCHESTRATOR_URL=%s\\n' '${orchestratorUrl}' >> "${envFile}"`,
              `  CHANGED=1`,
              `fi`,
              `if [ "$CHANGED" = "1" ]; then`,
              `  docker restart ${apiName} ${webName} 2>/dev/null || true`,
              `  echo PATCHED`,
              `else`,
              `  echo OK`,
              `fi`,
            ].join('\n');
            try {
              const r = await ssh.exec(creds, cmd);
              const out = (r.stdout || '').trim();
              if (out === 'PATCHED') {
                patched++;
                logger.info({ slug: t.slug }, '[token-sync] patched + restarted api+web');
              }
            } catch (err) {
              logger.warn({ slug: t.slug, err: (err as Error).message }, '[token-sync] SSH fail (skip)');
            }
          }
          logger.info({ total: tenants.length, patched }, '[token-sync] boot token-sync done');
        } catch (err) {
          logger.warn({ err: (err as Error).message }, '[token-sync] boot token-sync failed (non-fatal)');
        }
      })();
    }, 5000);
  }
}

// Phase 2+3 : workers de provisioning + monitoring. OPS_DISABLE_WORKERS=1 pour
// demarrer l'API seule (utile pour tests / migrations Prisma).
const workersDisabled = process.env.OPS_DISABLE_WORKERS === '1';
const workers = workersDisabled ? [] : startProvisioningWorkers();
let monitoringWorker: Worker | null = null;
if (!workersDisabled) {
  monitoringWorker = startMonitoringWorker();
  void scheduleMonitoringJobs().catch((err) => logger.error({ err }, '[monitor] schedule failed'));
}

async function shutdown(signal: string) {
  logger.info({ signal }, '[orchestrator] shutting down');
  server.close();
  await stopWorkers(workers);
  await closeMonitoring(monitoringWorker);
  await closeQueues();
  await redisConnection.quit().catch(() => undefined);
  await disconnectPrisma();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
