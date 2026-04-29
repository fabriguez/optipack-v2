import 'reflect-metadata';
import './container';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { disconnectPrisma } from './config/database';
import { logger } from './infrastructure/logger';
import routes from './presentation/routes';
import { errorHandler } from './presentation/middleware/errorHandler';
import { requestContext } from './presentation/middleware/requestContext';
import { container } from './container';
import { MetricsService } from './infrastructure/metrics/MetricsService';
import { startProvisioningWorkers, stopWorkers } from './infrastructure/queue/workers';
import { closeQueues } from './infrastructure/queue/queues';
import { redisConnection } from './infrastructure/queue/connection';
import {
  startMonitoringWorker,
  scheduleMonitoringJobs,
  closeMonitoring,
} from './infrastructure/queue/monitoring';
import type { Worker } from 'bullmq';

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

// CORS : whitelist via OPS_CORS_ORIGINS si fournie, sinon dev = all, prod = bloque.
app.use(
  cors({
    origin:
      config.corsOrigins.length > 0
        ? config.corsOrigins
        : config.env === 'production'
          ? false
          : true,
    credentials: true,
  }),
);

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

// Rate limit serre sur l'auth (10 tentatives login / 15 min / IP)
app.use(
  '/ops/auth/login',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(
  '/ops/auth/2fa',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
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
