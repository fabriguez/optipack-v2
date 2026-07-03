import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.API_PORT || '4000', 10),
  apiUrl: process.env.API_URL || 'http://localhost:4000',
  webUrl: process.env.WEB_URL || 'http://localhost:3000',
  // URL du portail client (app web-client). Sert aux liens des mails d'acces
  // client (distinct du backoffice webUrl). Retombe sur webUrl si non defini.
  clientPortalUrl: process.env.CLIENT_PORTAL_URL || process.env.WEB_URL || 'http://localhost:3001',

  database: {
    url: process.env.DATABASE_URL || 'postgresql://transitsoftservices:transitsoftservices@localhost:5432/transitsoftservices',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    accessKey: process.env.MINIO_ACCESS_KEY || 'transitsoftservices',
    secretKey: process.env.MINIO_SECRET_KEY || 'transitsoftservices_secret',
    bucket: process.env.MINIO_BUCKET || 'transitsoftservices',
    useSSL: process.env.MINIO_USE_SSL === 'true',
    // URL publique accessible depuis internet (pour les pieces jointes WhatsApp).
    // Ex: https://media.transitsoftservices.com  ou  http://vps-ip:9000
    // Si vide, les URLs presignees utilisent l'endpoint interne (dev local OK).
    publicBaseUrl: process.env.MINIO_PUBLIC_BASE_URL || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '12h',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '30d',
  },

  permissions: {
    // 'enforce' (defaut securise) : les refus de permission bloquent (403) et le
    // filtrage agence est actif. 'log' (shadow) : refus logges mais laisses
    // passer -- reserve au pre-prod. Cf. PERMISSIONS-PLAN.md etape 8.
    // NB : l'isolation TENANT (organizationId) est de toute facon un invariant
    // dur applique independamment de ce flag (cf. agencyScope.assert).
    enforce: (process.env.PERMISSIONS_ENFORCE || 'enforce') as 'log' | 'enforce',
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'TransitSoftServices <noreply@transitsoftservices.com>',
  },

  // Resend "shared" : utilise quand un tenant n'a pas son propre emailConfig.
  // Si RESEND_API_KEY est defini, on prefere Resend a SMTP pour la fallback.
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    from: process.env.RESEND_FROM || process.env.SMTP_FROM || 'TransitSoftServices <noreply@transitsoftservices.com>',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },

  // Stream Chat (getstream.io) : support client temps reel. apiKey est public
  // (renvoye aux apps), apiSecret reste serveur (mint des tokens + admin).
  stream: {
    apiKey: process.env.STREAM_API_KEY || '',
    apiSecret: process.env.STREAM_API_SECRET || '',
  },
} as const;

/**
 * Fail-fast securite : en production, refuser de demarrer avec des secrets
 * absents ou laisses a leur valeur placeholder. Un JWT_SECRET previsible =
 * forge universelle de tokens. En dev, les defauts restent tolerels.
 */
if (config.env === 'production') {
  const PLACEHOLDERS = new Set(['change-me-in-production', 'change-me-refresh']);
  const failures: string[] = [];
  if (!process.env.JWT_SECRET || PLACEHOLDERS.has(config.jwt.secret)) {
    failures.push('JWT_SECRET');
  }
  if (!process.env.JWT_REFRESH_SECRET || PLACEHOLDERS.has(config.jwt.refreshSecret)) {
    failures.push('JWT_REFRESH_SECRET');
  }
  if (config.jwt.secret === config.jwt.refreshSecret) {
    failures.push('JWT_SECRET==JWT_REFRESH_SECRET (doivent differer)');
  }
  if (failures.length > 0) {
    throw new Error(
      `[config] Secrets invalides en production : ${failures.join(', ')}. ` +
        'Definir des valeurs fortes et distinctes (openssl rand -hex 32).',
    );
  }
}
