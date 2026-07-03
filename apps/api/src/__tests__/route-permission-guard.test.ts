import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Garde-fou anti-regression (PERMISSIONS-PLAN.md etape 1) : toute route metier
 * de l'API doit porter un garde d'autorisation — requirePermission() (ABAC) ou
 * authorize() (role, garde dur) — soit au niveau de la route, soit au niveau du
 * routeur (router.use). Une nouvelle route ajoutee sans garde fait echouer ce
 * test, sauf si elle est explicitement whitelistee ci-dessous avec une raison.
 *
 * Detection : les middlewares retournes par authorize()/requirePermission()
 * sont des fonctions nommees authorizeMiddleware / requirePermissionMiddleware
 * (cf. authMiddleware.ts).
 */

const ROUTES_DIR = path.resolve(__dirname, '../presentation/routes/v1');

// Fichiers entierement hors perimetre (publics, auth, portail client, self-service).
const SKIPPED_FILES = new Set([
  'index.ts',
  'health.routes.ts',
  'auth.routes.ts',
  'client-portal.routes.ts',
  'payment-intent.routes.ts', // portail client (auth client)
  'public-agencies.routes.ts',
  'public-pricing.routes.ts',
  'public-tracking.routes.ts',
  'whatsapp-webhook.routes.ts',
  'me.routes.ts', // self-service employe
  'upload.routes.ts', // stockage generique authentifie — scoping objet a l'etape 2
  'search.routes.ts', // filtrage par section au niveau controller — etape 3
  'tenant-meta.routes.ts', // metadonnees publiques + mutations deja sous authorize
  'system.routes.ts', // router.use(authorize ADMIN) global, lectures incluses
]);

// Routes individuelles tolerees sans garde, avec raison.
const WHITELIST: Array<{ file: string; method: string; path: string; reason: string }> = [
  { file: 'payment-method.routes.ts', method: 'get', path: '/', reason: 'referentiel necessaire a tout formulaire de paiement' },
  { file: 'notification.routes.ts', method: 'get', path: '/', reason: 'notifications du user courant (self)' },
  { file: 'notification.routes.ts', method: 'get', path: '/unread-count', reason: 'self' },
  { file: 'notification.routes.ts', method: 'get', path: '/:id', reason: 'self' },
  { file: 'notification.routes.ts', method: 'post', path: '/:id/read', reason: 'self' },
  { file: 'notification.routes.ts', method: 'post', path: '/read-all', reason: 'self' },
  { file: 'attachment.routes.ts', method: 'get', path: '/expenses/:id/attachments', reason: 'lecture — scoping objet etape 2' },
  { file: 'attachment.routes.ts', method: 'get', path: '/disbursements/:id/attachments', reason: 'lecture — scoping objet etape 2' },
  { file: 'attachment.routes.ts', method: 'get', path: '/debts/:id/attachments', reason: 'lecture — scoping objet etape 2' },
  { file: 'attachment.routes.ts', method: 'get', path: '/fund-transfers/:id/attachments', reason: 'lecture — scoping objet etape 2' },
  { file: 'notification-templates.routes.ts', method: 'get', path: '/notification-events', reason: 'authentifie ; renvoie un registre statique d\'events (catalogue, aucune donnee tenant)' },
];

// `authenticateClient` : garde du portail client (verifie le jeton client + fait
// les checks d'appartenance clientId dans le handler). Compte comme garde.
const GUARD_NAMES = new Set(['authorizeMiddleware', 'requirePermissionMiddleware', 'authenticateClient']);

interface RouteInfo {
  method: string;
  path: string;
  guarded: boolean;
}

interface ExpressLayer {
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: { name?: string }; name?: string }> };
  handle?: { name?: string; stack?: ExpressLayer[] };
  name?: string;
}

/**
 * Traverse un routeur Express 4. Un garde pose en router.use() couvre les
 * routes du fichier (approximation : Express ne l'applique qu'aux routes
 * enregistrees apres, mais le pattern du projet est router.use en tete).
 */
function collectRoutes(stack: ExpressLayer[], inheritedGuard: boolean): RouteInfo[] {
  const routes: RouteInfo[] = [];
  let routerGuard = inheritedGuard;
  for (const layer of stack) {
    if (layer.route) {
      const handlerNames = layer.route.stack.map((h) => h.handle?.name ?? h.name ?? '');
      const guarded = routerGuard || handlerNames.some((n) => GUARD_NAMES.has(n));
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({ method, path: layer.route.path, guarded });
      }
    } else if (layer.handle?.stack) {
      routes.push(...collectRoutes(layer.handle.stack, routerGuard));
    } else if (GUARD_NAMES.has(layer.handle?.name ?? layer.name ?? '')) {
      routerGuard = true;
    }
  }
  return routes;
}

function isWhitelisted(file: string, route: RouteInfo): boolean {
  return WHITELIST.some(
    (w) => w.file === file && w.method === route.method && w.path === route.path,
  );
}

describe('garde-fou permissions sur les routes v1', () => {
  const files = fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith('.routes.ts') || f === 'index.ts')
    .filter((f) => !SKIPPED_FILES.has(f));

  it('couvre des fichiers de routes', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const file of files) {
    it(`${file} : toutes les routes portent un garde`, async () => {
      const mod = await import(path.join(ROUTES_DIR, file));
      const router = mod.default as { stack: ExpressLayer[] };
      expect(router?.stack, `${file} doit exporter un Router par defaut`).toBeDefined();

      const routes = collectRoutes(router.stack, false);
      const unguarded = routes.filter((r) => !r.guarded && !isWhitelisted(file, r));

      expect(
        unguarded,
        `Routes sans requirePermission/authorize dans ${file} :\n` +
          unguarded.map((r) => `  ${r.method.toUpperCase()} ${r.path}`).join('\n') +
          '\n→ ajouter un garde ou whitelister avec raison dans route-permission-guard.test.ts',
      ).toEqual([]);
    });
  }
});
