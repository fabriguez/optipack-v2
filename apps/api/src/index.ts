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

const app = express();
const httpServer = createServer(app);

// Socket.io
const io = new SocketServer(httpServer, {
  cors: {
    origin: config.socket.corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Global middleware
app.use(helmet());
app.use(
  cors({
    origin: [config.webUrl, config.socket.corsOrigin],
    credentials: true,
  }),
);
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

// Socket.io connection
io.on('connection', (socket) => {
  logger.debug({ socketId: socket.id }, 'Client connected');

  socket.on('disconnect', () => {
    logger.debug({ socketId: socket.id }, 'Client disconnected');
  });
});

// Start server
async function start(): Promise<void> {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected');

    // Ensure MinIO bucket
    await ensureBucket();

    httpServer.listen(config.port, () => {
      logger.info(`API server running on port ${config.port}`);
      logger.info(`Environment: ${config.env}`);
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
