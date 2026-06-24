/**
 * Resout une URL d'image potentiellement relative vers son origine absolue.
 * - URL absolue (http/https) -> tel quel
 * - URL relative commencant par /api -> prefixe avec l'origine de NEXT_PUBLIC_API_URL
 * - sinon -> tel quel
 */
import { getApiOrigin } from './baseUrl';

export function resolveImageUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^blob:|^data:/i.test(url)) return url;
  if (url.startsWith('/api/')) {
    return `${getApiOrigin()}${url}`;
  }
  return url;
}
