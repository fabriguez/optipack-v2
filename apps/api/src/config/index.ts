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
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '12h',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '30d',
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

  socket: {
    corsOrigin: process.env.SOCKET_CORS_ORIGIN || 'http://localhost:3000',
  },
} as const;
