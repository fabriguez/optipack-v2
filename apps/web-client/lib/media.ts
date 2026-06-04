const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

/**
 * Resout une URL media (avatar, photo colis, document) vers une URL joignable
 * par le navigateur courant.
 *
 * Le backend stocke des URLs absolues construites depuis son propre `API_URL`
 * (parfois `http://localhost:4000` ou un host interne non joignable). Pour les
 * images servies par notre API (`/api/vN/uploads/object/...`), on ignore donc
 * l'origine stockee et on reconstruit avec la base API publique du front
 * (`NEXT_PUBLIC_API_URL`).
 */
export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^(data:|blob:)/i.test(url)) return url;

  const base = API_URL.replace(/\/$/, '');
  const origin = base.replace(/\/api\/v\d+\/?$/, '');

  const apiPath = url.match(/\/api\/v\d+\/(.+)$/);
  if (apiPath) return `${origin}/api/v1/${apiPath[1]}`;

  if (/^https?:\/\//i.test(url)) return url;

  return base + (url.startsWith('/') ? url : '/' + url);
}
