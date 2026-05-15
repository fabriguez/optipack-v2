import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'env requise manquante : ${name}`);
  return v;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.OPS_PORT ?? 4020),
  databaseUrl: required('OPS_DATABASE_URL'),
  redisUrl: process.env.OPS_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwt: {
    secret: required('OPS_JWT_SECRET'),
    accessExpiry: process.env.OPS_JWT_ACCESS_EXPIRY ?? '1h',
  },
  // Cle maitre AES-256-GCM pour chiffrer les SSH keys des VPS.
  // Doit faire 32 bytes (64 chars hex). Generer avec : openssl rand -hex 32
  masterKey: required('OPS_MASTER_KEY'),
  bcryptRounds: Number(process.env.OPS_BCRYPT_ROUNDS ?? 10),
  // Issuer pour le 2FA (affiche dans Google Authenticator)
  totpIssuer: process.env.OPS_TOTP_ISSUER ?? 'TransitSoftServices Ops',
  // GHCR
  ghcr: {
    namespace: process.env.OPS_GHCR_NAMESPACE ?? 'transitsoftservices',
    pullToken: process.env.OPS_GHCR_TOKEN ?? '',
  },
  // Chemin local des fichiers d'environnement des tenants sur le VPS.
  // Si le VPS ne permet pas l'ecriture dans /etc/optipack, definissez
  // OPS_TENANT_ENV_DIR vers un repertoire utilisateur persistant.
  tenantEnvDir: process.env.OPS_TENANT_ENV_DIR ?? '~/.optipack',
  // Resend (envoi transactionnel multi-tenant, 1 domaine par tenant)
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    // Domaine racine : on cree les sous-domaines sous celui-ci par defaut.
    // ex: tenants/acme.transitsoftservices.com
    baseDomain: process.env.RESEND_BASE_DOMAIN ?? 'transitsoftservices.com',
    region: process.env.RESEND_REGION ?? 'eu-west-1', // 'us-east-1' | 'eu-west-1' | 'sa-east-1' | 'ap-northeast-1'
  },
  // Pour generer les liens dans les emails
  publicWebUrl: process.env.OPS_PUBLIC_WEB_URL ?? 'http://localhost:3020',
  // CORS : liste blanche d'origines (csv). Vide = autoriser toutes les origines (dev).
  // Ex: "https://ops-admin.transitsoftservices.com,https://staging-ops.transitsoftservices.com"
  corsOrigins: (process.env.OPS_CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  smtp: {
    host: process.env.OPS_SMTP_HOST ?? '',
    port: Number(process.env.OPS_SMTP_PORT ?? 587),
    secure: process.env.OPS_SMTP_SECURE === 'true',
    user: process.env.OPS_SMTP_USER ?? '',
    pass: process.env.OPS_SMTP_PASS ?? '',
    from: process.env.OPS_SMTP_FROM ?? 'TransitSoftServices Ops <ops@transitsoftservices.com>',
  },
  // Webhook Discord/Slack pour alertes ops (VPS down, freeze, etc.)
  alertWebhookUrl: process.env.OPS_ALERT_WEBHOOK_URL ?? '',
} as const;
