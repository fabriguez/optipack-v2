import type { CorsOptions } from 'cors';

/**
 * Construit une CorsOptions tolerante mais securisee, utilisable a la fois
 * par Express (HTTP) et Socket.io.
 *
 * Strategie :
 *  - liste blanche d'origines fixes (depuis ALLOWED_ORIGINS, separes par virgule)
 *  - + liste blanche de patterns regex (depuis ALLOWED_ORIGIN_PATTERNS), pour
 *    matcher *.transitsoftservices.com sans devoir lister chaque sous-domaine
 *  - en dev (NODE_ENV !== 'production') : on autorise toutes les origines
 *    locales (localhost / 127.0.0.1 / 192.168.x.x) automatiquement
 *  - on accepte les requetes sans Origin (curl, healthchecks, server-to-server)
 *  - credentials: true (pour les cookies de session / Authorization preflight)
 *
 * Variables d'env :
 *   ALLOWED_ORIGINS         "https://a.example.com,https://b.example.com"
 *   ALLOWED_ORIGIN_PATTERNS "^https://[^/]+\\.transitsoftservices\\.com$"
 *                           plusieurs patterns separes par "|" (alternation regex)
 */

const STATIC = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const PATTERNS = (process.env.ALLOWED_ORIGIN_PATTERNS ?? '')
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

// Defauts production : si rien n'est configure, on accepte tous les sous-domaines
// de la base domain (ce qui couvre app., www., api., ops-admin., ops., et tous
// les futurs tenants {slug}., www.{slug}., app.{slug}., api.{slug}.). UFW +
// Caddy filtrent deja les hostnames valides en amont.
const BASE_DOMAIN = (process.env.OPS_BASE_DOMAIN ?? process.env.BASE_DOMAIN ?? 'transitsoftservices.com')
  .replace(/[.]/g, '\\.');

const DEFAULT_PATTERN = new RegExp(`^https?:\\/\\/([a-z0-9-]+\\.)*${BASE_DOMAIN}$`, 'i');
const ALL_PATTERNS: RegExp[] = [...PATTERNS, DEFAULT_PATTERN];

const IS_DEV = (process.env.NODE_ENV ?? 'development') !== 'production';
const DEV_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\d+\.\d+\.\d+\.\d+|.*\.local)(:\d+)?$/i;

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // server-to-server, curl, healthcheck (pas d'Origin)
  if (STATIC.includes(origin)) return true;
  if (ALL_PATTERNS.some((re) => re.test(origin))) return true;
  if (IS_DEV && DEV_PATTERN.test(origin)) return true;
  return false;
}

export const corsOptions: CorsOptions = {
  origin(origin, cb) {
    if (isAllowedOrigin(origin)) {
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
    'X-Tenant-Slug',
    'Accept',
    'Origin',
  ],
  exposedHeaders: ['Content-Disposition', 'X-Request-Id'],
  maxAge: 86400, // 24h cache du preflight cote navigateur
  optionsSuccessStatus: 204,
};

/** Reutilisable pour Socket.io (qui accepte un `cors: {origin: ...}` au meme format).
 *  NB : pas de `as const` sur methods, engine.io exige un tableau mutable. */
export const socketCorsOptions = {
  origin(origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) {
    if (isAllowedOrigin(origin)) cb(null, true);
    else cb(new Error(`Socket origin non autorisee : ${origin}`));
  },
  methods: ['GET', 'POST'],
  credentials: true,
};
