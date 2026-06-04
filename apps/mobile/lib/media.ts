const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const API_URL = env?.EXPO_PUBLIC_API_URL ?? 'https://api.transitsoftservices.com/api/v1';

/**
 * Resout une URL media stockee (souvent relative, ex `/uploads/object/<key>`)
 * en URL absolue servie par l'API. Laisse passer les URLs deja absolues
 * (http/https) et les data: URIs locales. Retourne null si vide.
 */
export function mediaUri(url?: string | null): string | null {
  if (!url) return null;
  // Deja absolue (cas normal : l'API stocke des URLs absolues) ou locale.
  if (/^(https?:|data:|file:|blob:)/i.test(url)) return url;
  // URL relative servie sous /api/vN/... : prefixer avec l'ORIGINE (sans le
  // segment /api/vN deja present dans l'URL), comme resolveImageUrl cote web.
  const origin = API_URL.replace(/\/api\/v\d+\/?$/, '');
  if (url.startsWith('/api/')) return `${origin}${url}`;
  // Autre chemin relatif (`/uploads/...`) : prefixer la base API complete.
  return API_URL.replace(/\/$/, '') + (url.startsWith('/') ? url : '/' + url);
}
