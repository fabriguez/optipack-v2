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

/**
 * Verifie au demarrage :
 *  1. que le bucket existe (le cree sinon) ;
 *  2. que les credentials sont valides en faisant un putObject + removeObject
 *     d'une probe minimale. Ca attrape SignatureDoesNotMatch / AccessDenied
 *     DES LE BOOT (donc dans les logs Docker au demarrage du conteneur),
 *     plutot qu'a la premiere tentative d'upload utilisateur.
 *
 * Echec non bloquant volontairement : l'API peut tourner sans upload
 * fonctionnel (lecture seule). On log juste un WARN tres visible avec les
 * 3 dimensions a verifier : endpoint/bucket/credentials.
 */
export async function ensureBucket(): Promise<void> {
  const bucketName = config.minio.bucket;
  const cfg = {
    endpoint: `${config.minio.useSSL ? 'https' : 'http'}://${config.minio.endpoint}:${config.minio.port}`,
    bucket: bucketName,
    accessKey: config.minio.accessKey ? `${config.minio.accessKey.slice(0, 4)}***` : '(empty)',
  };

  try {
    const exists = await minioClient.bucketExists(bucketName);
    if (!exists) {
      await minioClient.makeBucket(bucketName);
      logger.info({ ...cfg }, `MinIO bucket "${bucketName}" created`);
    }
  } catch (err: any) {
    logger.error(
      { err, ...cfg },
      `MinIO bucket "${bucketName}" inaccessible. Verifiez MINIO_ENDPOINT / MINIO_BUCKET / MINIO_ACCESS_KEY / MINIO_SECRET_KEY cote VPS.`,
    );
    return;
  }

  // Probe upload (1 byte) + suppression. Si SignatureDoesNotMatch ou
  // AccessDenied, on saura immediatement au demarrage.
  const probeKey = `__probe__/${Date.now()}.txt`;
  try {
    await minioClient.putObject(bucketName, probeKey, Buffer.from('ok'), 2, {
      'Content-Type': 'text/plain',
    });
    await minioClient.removeObject(bucketName, probeKey).catch(() => {});
    logger.info({ ...cfg }, 'MinIO probe OK : credentials valides, upload fonctionnel.');
  } catch (err: any) {
    logger.error(
      { err: { code: err?.code, message: err?.message }, ...cfg },
      `MinIO probe FAILED (${err?.code || err?.name}). Les uploads vont echouer. Verifiez MINIO_ACCESS_KEY / MINIO_SECRET_KEY sur ce VPS (les valeurs doivent matcher MINIO_ROOT_USER / MINIO_ROOT_PASSWORD du conteneur MinIO).`,
    );
  }
}
