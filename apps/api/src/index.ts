import 'reflect-metadata';
import './container'; // Register DI bindings
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';

import { config } from './config';
import { logger } from './config/logger';
import { prisma } from './config/database';
import { ensureBucket } from './config/minio';
import { requestLogger } from './presentation/middleware/requestLogger';
import { auditMiddleware } from './presentation/middleware/auditMiddleware';
import { errorHandler } from './presentation/middleware/errorHandler';
import v1Routes from './presentation/routes/v1';
import { startCronJobs } from './infrastructure/cron/CronService';
import { registerHandlers as registerNotificationHandlers } from './infrastructure/events/handlers/NotificationHandler';
import { registerDailyReportEmailHandler } from './infrastructure/events/handlers/DailyReportEmailHandler';
import { registerNotificationProviders } from './infrastructure/notifications/providers';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '@transitsoftservices/shared';
import { realtimeService } from './infrastructure/realtime/RealtimeService';
import { corsOptions, socketCorsOptions } from './config/cors';

const app = express();
const httpServer = createServer(app);

// Socket.io
// CORS centralise via ./config/cors.ts (cf. import en haut). Allowlist par
// regex sur tous les sous-domaines de BASE_DOMAIN + ALLOWED_ORIGINS env.
const io = new SocketServer(httpServer, {
  cors: socketCorsOptions,
});

// Global middleware
app.use(helmet());
app.use(cors(corsOptions));
// Repond aux preflight OPTIONS pour toutes les routes (cors() le fait deja
// implicitement, on l'ajoute explicitement pour les cas litigieux).
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestLogger);
app.use(auditMiddleware);

// API routes
app.use('/api/v1', v1Routes);

// 404
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route introuvable',
    code: 'NOT_FOUND',
  });
});

// Error handler
app.use(errorHandler);

// ============================================================
// Socket.io : auth JWT au handshake + join automatique des rooms
// ============================================================
// Le client doit passer le JWT au handshake : io(url, { auth: { token } }).
// Sans token valide, le socket reste connecte mais ne joint aucune room ;
// il ne recevra donc aucun message cible. Pas de rejet "dur" pour permettre
// des canaux publics si besoin (chat support pre-auth, etc).
io.use((socket, next) => {
  const token = (socket.handshake.auth?.token as string | undefined) ?? '';
  if (!token) {
    socket.data.auth = null;
    return next();
  }
  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload & { clientId?: string };
    socket.data.auth = payload;
  } catch {
    socket.data.auth = null;
  }
  next();
});

io.on('connection', (socket) => {
  const auth = socket.data.auth as (JwtPayload & { clientId?: string }) | null;
  logger.debug({ socketId: socket.id, userId: auth?.userId, clientId: auth?.clientId }, 'Client connected');

  // Join automatique des rooms en fonction du JWT.
  if (auth?.userId) socket.join(`user:${auth.userId}`);
  if (auth?.clientId) socket.join(`client:${auth.clientId}`);
  if (auth?.organizationId) socket.join(`org:${auth.organizationId}`);
  if (auth?.agencyIds?.length) {
    for (const aid of auth.agencyIds) socket.join(`agency:${aid}`);
  }

  socket.on('disconnect', () => {
    logger.debug({ socketId: socket.id }, 'Client disconnected');
  });
});

// Attache le service realtime pour que les emetteurs (NotificationService...)
// puissent diffuser sans dependre de l'export du `io` directement.
realtimeService.attach(io);

// Start server
async function start(): Promise<void> {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected');

    // Ensure MinIO bucket
    await ensureBucket();

    // Register event handlers
    registerNotificationHandlers();
    registerNotificationProviders();
    registerDailyReportEmailHandler();

    // Start cron jobs
    startCronJobs();

    httpServer.listen(config.port, () => {
      logger.info(`API server running on port ${config.port}`);
      logger.info(`Environment: ${config.env}`);

      // Empreinte du JWT_SECRET au demarrage : permet de detecter quand
      // plusieurs instances API derriere un load balancer ont des secrets
      // divergents (l'une signe les tokens, l'autre les rejette en signature
      // invalide). Le hash est tronque, le secret n'est jamais expose.
      try {
        const crypto = require('crypto');
        const fp = crypto
          .createHash('sha256')
          .update(config.jwt.secret)
          .digest('hex')
          .slice(0, 12);
        logger.info(
          `JWT_SECRET fingerprint=${fp} accessExpiry=${config.jwt.accessExpiry} ` +
            `(les instances clusterees doivent toutes avoir le meme fingerprint)`,
        );
      } catch {
        // ignore, c'est juste du diagnostic
      }
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await prisma.$disconnect();
  httpServer.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  await prisma.$disconnect();
  httpServer.close();
  process.exit(0);
});

start();

export { app, io };
