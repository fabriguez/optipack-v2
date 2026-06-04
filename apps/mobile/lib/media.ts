const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const API_URL = env?.EXPO_PUBLIC_API_URL ?? 'https://api.transitsoftservices.com/api/v1';

/**
 * Resout une URL media stockee (souvent relative, ex `/uploads/object/<key>`)
 * en URL absolue servie par l'API. Laisse passer les URLs deja absolues
 * (http/https) et les data: URIs locales. Retourne null si vide.
 */
export function mediaUri(url?: string | null): string | null {
  if (!url) return null;
  // Locales / inline : telles quelles.
  if (/^(data:|file:|blob:)/i.test(url)) return url;

  const base = API_URL.replace(/\/$/, '');
  const origin = base.replace(/\/api\/v\d+\/?$/, '');

  // Image servie par notre API sous /api/vN/... (ex /api/v1/uploads/object/<key>).
  // Le host stocke en base est souvent celui du serveur (API_URL backend, parfois
  // `http://localhost:4000` ou un host interne) et n'est PAS joignable depuis
  // l'appareil. On ignore donc l'origine d'origine et on reconstruit l'URL avec
  // la base API configuree cote app (EXPO_PUBLIC_API_URL), qui elle est joignable.
  const apiPath = url.match(/\/api\/v\d+\/(.+)$/);
  if (apiPath) return `${origin}/api/v1/${apiPath[1]}`;

  // Absolue hors de notre API (image externe / CDN) : telle quelle.
  if (/^https?:\/\//i.test(url)) return url;

  // Chemin relatif simple (`/uploads/...`) : prefixer la base API complete.
  return base + (url.startsWith('/') ? url : '/' + url);
}
