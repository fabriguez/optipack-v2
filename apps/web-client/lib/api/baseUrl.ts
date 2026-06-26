/**
 * Resolution de l'URL de base de l'API (multi-tenant) pour le PORTAIL PUBLIC.
 *
 * Un SEUL build Next.js web-client est partage entre tous les tenants, et
 * `NEXT_PUBLIC_*` est fige au build : impossible d'injecter l'URL de l'API par
 * tenant. Avant, `apiClient` utilisait `NEXT_PUBLIC_API_URL` (generique) ->
 * cote navigateur il tapait localhost/une URL fausse -> /tenant-meta echouait
 * -> nom + skin du tenant retombaient sur les valeurs par defaut.
 *
 * On derive donc l'URL de l'API cote navigateur depuis le host courant :
 *   <slug>.<base>        -> api.<slug>.<base>
 *   www.<slug>.<base>    -> api.<slug>.<base>   (on retire le prefixe www.)
 *   <custom-domain>      -> api.<custom-domain>
 * (meme regle que CaddyService / cors.ts cote backend, sans le prefixe app.
 * propre au back-office.) En dev (localhost / IP) ou en SSR, on garde
 * NEXT_PUBLIC_API_URL.
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
  if (isLocalHost(hostname)) return ENV_API_URL;
  const host = hostname.startsWith('www.') ? hostname.slice('www.'.length) : hostname;
  return `${protocol}//api.${host}/api/v1`;
}

/** Origine de l'API sans le suffixe /api/v1 (pour construire des URLs de fichiers). */
export function getApiOrigin(): string {
  return getApiBaseUrl().replace(/\/api\/v\d+\/?$/, '');
}
