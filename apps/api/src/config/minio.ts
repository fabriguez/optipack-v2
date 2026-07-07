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
 * Client dedie a la PRESIGNATION d'URLs accessibles depuis internet.
 *
 * Une URL presignee SigV4 signe le header `host` (`X-Amz-SignedHeaders=host`).
 * Reecrire le host APRES la signature (minio:9000 -> s3.<domaine>) invalide la
 * signature -> 403 SignatureDoesNotMatch cote MinIO. La seule facon correcte est
 * de SIGNER directement contre l'endpoint public. Ce client pointe donc sur
 * MINIO_PUBLIC_BASE_URL (host/port/ssl parses). La presignation est un calcul
 * local (pas de connexion), donc pas besoin que ce host soit joignable depuis
 * le conteneur. Null si MINIO_PUBLIC_BASE_URL absent -> fallback endpoint interne.
 */
let publicPresignClient: Minio.Client | null | undefined;
function getPublicPresignClient(): Minio.Client | null {
  if (publicPresignClient !== undefined) return publicPresignClient;
  const base = config.minio.publicBaseUrl;
  if (!base) {
    publicPresignClient = null;
    return null;
  }
  try {
    const u = new URL(base);
    const useSSL = u.protocol === 'https:';
    publicPresignClient = new Minio.Client({
      endPoint: u.hostname,
      port: u.port ? parseInt(u.port, 10) : useSSL ? 443 : 80,
      useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });
  } catch (err) {
    logger.warn({ err, base }, 'MINIO_PUBLIC_BASE_URL invalide -> presign public desactive');
    publicPresignClient = null;
  }
  return publicPresignClient;
}

/**
 * Presigne un GET valide DEPUIS INTERNET (pieces jointes WhatsApp/email, liens
 * partages). Signe contre l'endpoint public si MINIO_PUBLIC_BASE_URL est defini,
 * sinon retombe sur l'endpoint interne (dev local uniquement -> URL inaccessible
 * hors conteneur). Aucune reecriture de host (casserait la signature).
 */
export function presignPublicGet(bucket: string, key: string, expirySec = 1800): Promise<string> {
  const client = getPublicPresignClient() ?? minioClient;
  return client.presignedGetObject(bucket, key, expirySec);
}

/** Prefixe des objets a lecture publique anonyme (cf StorageService.PUBLIC_PREFIX). */
const PUBLIC_PREFIX = 'public/';

/**
 * Applique (idempotent) une bucket policy autorisant `s3:GetObject` anonyme
 * sur `<bucket>/public/*` uniquement. On preserve toute policy existante non
 * liee a notre statement (merge par Sid). Sans MINIO_PUBLIC_BASE_URL la policy
 * reste utile (acces direct via l'endpoint), mais les URLs publiques ne seront
 * generees que si publicBaseUrl est defini (cf StorageService.publicUrl).
 */
async function ensurePublicPrefixPolicy(bucketName: string): Promise<void> {
  const SID = 'PublicReadPublicPrefix';
  const statement = {
    Sid: SID,
    Effect: 'Allow',
    Principal: { AWS: ['*'] },
    Action: ['s3:GetObject'],
    Resource: [`arn:aws:s3:::${bucketName}/${PUBLIC_PREFIX}*`],
  };

  let policy: { Version: string; Statement: any[] } = {
    Version: '2012-10-17',
    Statement: [],
  };
  try {
    const existing = await minioClient.getBucketPolicy(bucketName);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed?.Statement) {
        policy = {
          Version: parsed.Version || '2012-10-17',
          Statement: parsed.Statement.filter((s: any) => s?.Sid !== SID),
        };
      }
    }
  } catch {
    // Pas de policy existante (NoSuchBucketPolicy) -> on part d'une policy vide.
  }

  policy.Statement.push(statement);
  await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
  logger.info({ bucket: bucketName, prefix: PUBLIC_PREFIX }, 'MinIO public/* read policy appliquee.');
}

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
    // Lecture anonyme sur le prefixe public/ UNIQUEMENT (logos de tenant, etc.).
    // Le reste du bucket (uploads/, tmp/...) reste prive. Permet de servir les
    // assets publics en direct (s3.<domain>/<bucket>/public/...) sans proxy API
    // ni token -> login page, favicon, site web, emails.
    await ensurePublicPrefixPolicy(bucketName).catch((err: any) =>
      logger.warn(
        { err: { code: err?.code, message: err?.message }, bucket: bucketName },
        'MinIO public/* policy non appliquee (les logos retomberont sur le proxy API).',
      ),
    );
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
