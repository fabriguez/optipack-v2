/**
 * Resout une URL d'image potentiellement relative vers son origine absolue.
 * - URL absolue (http/https) -> tel quel
 * - URL relative commencant par /api -> prefixe avec l'origine de VITE_API_URL
 * - sinon -> tel quel
 */
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

export function resolveImageUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^blob:|^data:/i.test(url)) return url;
  if (url.startsWith('/api/')) {
    const origin = API_BASE.replace(/\/api\/v\d+\/?$/, '');
    return `${origin}${url}`;
  }
  return url;
}
