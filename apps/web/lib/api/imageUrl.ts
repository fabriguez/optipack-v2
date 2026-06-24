/**
 * Resout une URL d'image potentiellement relative vers son origine absolue.
 * - URL absolue (http/https) -> tel quel
 * - URL relative commencant par /api -> prefixe avec l'origine de NEXT_PUBLIC_API_URL
 * - sinon -> tel quel
 */
import { getApiOrigin } from './baseUrl';

export function resolveImageUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^blob:|^data:/i.test(url)) return url;
  // URL relative servie par l'API -> prefixe l'origine API courante.
  if (url.startsWith('/api/')) {
    return `${getApiOrigin()}${url}`;
  }
  // URL absolue : si elle pointe vers un endpoint API (`/api/vN/...`), on la
  // re-heberge sur l'origine API courante. Corrige les URLs a host fige
  // (ex http://localhost:4000/api/v1/... ou un ancien host baked) sans
  // migration DB. Les URLs externes (CDN, etc.) sont laissees telles quelles.
  if (/^https?:\/\//i.test(url)) {
    const apiIdx = url.indexOf('/api/');
    return apiIdx !== -1 ? `${getApiOrigin()}${url.slice(apiIdx)}` : url;
  }
  return url;
}
