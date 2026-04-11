import * as Minio from 'minio';
import { config } from './index';
import { logger } from './logger';

export const minioClient = new Minio.Client({
  endPoint: config.minio.endpoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

export async function ensureBucket(): Promise<void> {
  const bucketName = config.minio.bucket;
  try {
    const exists = await minioClient.bucketExists(bucketName);
    if (!exists) {
      await minioClient.makeBucket(bucketName);
      logger.info(`MinIO bucket "${bucketName}" created`);
    }
  } catch (err) {
    logger.error({ err }, 'MinIO bucket check failed');
  }
}
