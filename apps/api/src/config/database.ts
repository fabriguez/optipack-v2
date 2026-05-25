import { PrismaClient } from '@prisma/client';
import { config } from './index';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: config.database.url,
    // Pas de log 'query' (trop verbeux et pas humain-lisible). Set
    // PRISMA_LOG_QUERIES=1 pour les rafficher temporairement.
    log: process.env.PRISMA_LOG_QUERIES === '1'
      ? ['query', 'error', 'warn']
      : config.env === 'development'
        ? ['error', 'warn']
        : ['error'],
  });

if (config.env !== 'production') {
  globalForPrisma.prisma = prisma;
}
