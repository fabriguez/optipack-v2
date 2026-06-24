/**
 * Resolution de l'URL de base de l'API (multi-tenant).
 *
 * Le back-office est servi sur `app.<...>` et l'API du tenant sur `api.<...>`
 * (meme regle que CaddyService / cors.ts cote backend). Un SEUL build Next.js
 * est partage entre tous les tenants, et `NEXT_PUBLIC_*` est fige au moment du
 * build : impossible d'injecter l'URL de l'API par tenant a l'execution. Si on
 * laissait une URL relative (`/api/v1`), l'appel taperait l'origine du front
 * (`app.<tenant>...`) qui n'expose pas l'API -> 404 Next.js.
 *
 * On derive donc l'URL de l'API cote navigateur depuis le host courant :
 *   app.<tenant>.<base>  ->  api.<tenant>.<base>
 * En dev (localhost / IP) ou cote serveur (SSR), on garde NEXT_PUBLIC_API_URL.
 */
const ENV_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    hostname.endsWith('.local')
  );
}

/** URL de base complete de l'API tenant (ex: https://api.acme.exemple.com/api/v1). */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return ENV_API_URL;
  const { hostname, protocol } = window.location;
  // Dev local / IP directe : on respecte la config explicite.
  if (isLocalHost(hostname)) return ENV_API_URL;
  // Production : back-office app.<...> -> API api.<...>. Si pas de prefixe app.,
  // on prefixe quand meme api. (cas du tenant principal sur le domaine racine).
  const apiHost = hostname.startsWith('app.')
    ? `api.${hostname.slice('app.'.length)}`
    : `api.${hostname}`;
  return `${protocol}//${apiHost}/api/v1`;
}

/** Origine de l'API sans le suffixe /api/v1 (pour construire des URLs de fichiers). */
export function getApiOrigin(): string {
  return getApiBaseUrl().replace(/\/api\/v\d+\/?$/, '');
}
