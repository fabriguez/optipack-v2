import type { CorsOptions } from 'cors';

/**
 * CORS centralise pour l'orchestrator (control plane).
 *
 * Defaut accommodant : on accepte tous les sous-domaines de OPS_BASE_DOMAIN
 * (typiquement *.transitsoftservices.com), ce qui couvre ops-admin.{base},
 * ops.{base}, app.{base}, www.{base}, et tous les sous-domaines des futurs
 * tenants ({slug}.{base}, www.{slug}.{base}, app.{slug}.{base}, api.{slug}.{base}).
 *
 * Personnaliser via :
 *   OPS_CORS_ORIGINS         "https://a.example.com,https://b.example.com" (liste exacte additionnelle)
 *   OPS_CORS_ORIGIN_PATTERNS "^regex$|^other$" (patterns additionnels)
 */

const STATIC = (process.env.OPS_CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const PATTERNS = (process.env.OPS_CORS_ORIGIN_PATTERNS ?? '')
  .split('|')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((p) => {
    try {
      return new RegExp(p);
    } catch {
      return null;
    }
  })
  .filter((r): r is RegExp => r !== null);

const BASE_DOMAIN = (process.env.OPS_BASE_DOMAIN ?? 'transitsoftservices.com').replace(
  /[.]/g,
  '\\.',
);
const DEFAULT_PATTERN = new RegExp(`^https?:\\/\\/([a-z0-9-]+\\.)*${BASE_DOMAIN}$`, 'i');
const ALL_PATTERNS = [...PATTERNS, DEFAULT_PATTERN];

const IS_DEV = (process.env.NODE_ENV ?? 'development') !== 'production';
const DEV_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\d+\.\d+\.\d+\.\d+|.*\.local)(:\d+)?$/i;

export function isAllowedOpsOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // server-to-server, healthcheck
  if (STATIC.includes(origin)) return true;
  if (ALL_PATTERNS.some((re) => re.test(origin))) return true;
  if (IS_DEV && DEV_PATTERN.test(origin)) return true;
  return false;
}

export const corsOptions: CorsOptions = {
  origin(origin, cb) {
    if (isAllowedOpsOrigin(origin)) {
      cb(null, true);
      return;
    }
    cb(new Error(`Origin non autorisee : ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-CSRF-Token',
    'Accept',
    'Origin',
  ],
  exposedHeaders: ['Content-Disposition', 'X-Request-Id'],
  maxAge: 86400,
  optionsSuccessStatus: 204,
};
