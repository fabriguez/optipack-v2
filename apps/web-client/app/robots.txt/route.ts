import type { NextRequest } from 'next/server';

/**
 * robots.txt dynamique (multi-tenant : le sitemap pointe sur le host courant).
 * Strategie GEO : les bots AI de recherche/citation (OAI-SearchBot,
 * ChatGPT-User, Claude-SearchBot, PerplexityBot...) sont autorises — les
 * bloquer ferait disparaitre le site des reponses des assistants AI.
 * Le dashboard et l'auth sont exclus du crawl.
 */
export function GET(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3001';
  const proto = req.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const base = `${proto}://${host}`;

  const body = `User-agent: *
Allow: /
Disallow: /app/
Disallow: /studio/
Disallow: /login
Disallow: /register
Disallow: /forgot-password
Disallow: /reset-password

Sitemap: ${base}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
