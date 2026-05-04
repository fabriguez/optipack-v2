import { injectable } from 'tsyringe';
import { Readable } from 'stream';
import { minioClient } from '../../config/minio';
import { config } from '../../config';
import { logger } from '../../config/logger';

const BUCKET = config.minio.bucket;

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
    await minioClient.putObject(BUCKET, key, buffer, buffer.length, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    });
    return { key, size: buffer.length, contentType };
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
