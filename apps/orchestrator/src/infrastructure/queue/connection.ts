import IORedis, { type RedisOptions } from 'ioredis';
import { config } from '../../config';

/**
 * Connexion Redis partagee pour BullMQ.
 * `maxRetriesPerRequest: null` est REQUIS par BullMQ.
 */
const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
};

export const redisConnection = new IORedis(config.redisUrl, redisOptions);

export const QUEUE_NAMES = {
  PROVISION: 'tenant-provision',
  FREEZE: 'tenant-freeze',
  UNFREEZE: 'tenant-unfreeze',
  DELETE: 'tenant-delete',
  PURGE: 'tenant-purge',
  MIGRATE: 'tenant-migrate',
  UPDATE: 'tenant-update',
  ROLLBACK: 'tenant-rollback',
  SITE_DEPLOY: 'tenant-site-deploy',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
