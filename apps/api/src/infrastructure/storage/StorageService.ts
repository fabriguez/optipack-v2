import { injectable } from 'tsyringe';
import { Readable } from 'stream';
import { minioClient } from '../../config/minio';
import { config } from '../../config';
import { logger } from '../../config/logger';

const BUCKET = config.minio.bucket;

/** Endpoint MinIO cible (pour les logs : aide a voir si on tape minio:9000 interne). */
const MINIO_ENDPOINT = `${config.minio.useSSL ? 'https' : 'http'}://${config.minio.endpoint}:${config.minio.port}`;

export interface UploadResult {
  key: string;
  size: number;
  contentType: string;
}

@injectable()
export class StorageService {
  /**
   * Upload un buffer dans MinIO.
   * @param key chemin/cle dans le bucket (ex : "agencies/abc/photo.jpg")
   * @param buffer contenu binaire
   * @param contentType type MIME
   */
  async uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<UploadResult> {
    const started = Date.now();
    logger.info(
      { key, bucket: BUCKET, endpoint: MINIO_ENDPOINT, size: buffer.length, contentType },
      '[upload] putObject start',
    );
    try {
      await minioClient.putObject(BUCKET, key, buffer, buffer.length, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      });
      logger.info(
        { key, bucket: BUCKET, size: buffer.length, durationMs: Date.now() - started },
        '[upload] putObject OK',
      );
      return { key, size: buffer.length, contentType };
    } catch (err: any) {
      logger.error(
        {
          key,
          bucket: BUCKET,
          endpoint: MINIO_ENDPOINT,
          size: buffer.length,
          code: err?.code,
          message: err?.message,
          durationMs: Date.now() - started,
        },
        '[upload] putObject FAILED',
      );
      throw err;
    }
  }

  /**
   * Recupere un objet sous forme de stream + metadata.
   */
  async getObject(key: string): Promise<{ stream: Readable; contentType: string; size: number } | null> {
    try {
      const stat = await minioClient.statObject(BUCKET, key);
      const stream = await minioClient.getObject(BUCKET, key);
      return {
        stream: stream as unknown as Readable,
        contentType: (stat.metaData?.['content-type'] as string) || 'application/octet-stream',
        size: stat.size,
      };
    } catch (err: any) {
      if (err?.code === 'NotFound' || err?.code === 'NoSuchKey') return null;
      logger.error({ err, key }, 'StorageService.getObject failed');
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await minioClient.removeObject(BUCKET, key);
    } catch (err) {
      logger.warn({ err, key }, 'StorageService.deleteObject failed (ignored)');
    }
  }

  /**
   * Genere un identifiant d'objet unique. Utilise pour les uploads (ex : photo agence).
   */
  buildKey(prefix: string, ext: string): string {
    const safe = ext.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || 'bin';
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}/${stamp}-${rand}.${safe}`;
  }
}
