const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Resout l'URL de base du site vitrine public (web-client).
 *
 * Priorite :
 *  1. `tenantWebsiteUrl` (meta tenant runtime, si fournie par le serveur)
 *  2. `EXPO_PUBLIC_WEB_URL` (override build-time)
 *  3. Derivee depuis `EXPO_PUBLIC_API_URL` : on retire le chemin `/api/...`
 *     et le sous-domaine `api.` pour retomber sur le domaine public.
 *     ex: https://api.acme.com/api/v1 -> https://acme.com
 */
export function getWebBaseUrl(tenantWebsiteUrl?: string | null): string {
  const explicit = tenantWebsiteUrl?.trim() || env?.EXPO_PUBLIC_WEB_URL?.trim();
  if (explicit) return stripTrailingSlash(explicit);

  const apiUrl = env?.EXPO_PUBLIC_API_URL ?? 'https://api.transitsoftservices.com/api/v1';
  const match = apiUrl.match(/^(https?:\/\/)([^/]+)/i);
  if (!match) return 'https://transitsoftservices.com';
  const [, scheme, host] = match;
  const webHost = host.replace(/^api\./i, '');
  return `${scheme}${webHost}`;
}
