import type { NextRequest } from 'next/server';
import { PUBLIC_PAGES } from '@/lib/seo';

/** Sitemap dynamique base sur le host courant (un domaine par tenant). */
export function GET(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3001';
  const proto = req.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const base = `${proto}://${host}`;

  const urls = PUBLIC_PAGES.map(
    (p) => `  <url><loc>${base}${p.path}</loc><changefreq>weekly</changefreq><priority>${p.path === '/' ? '1.0' : '0.7'}</priority></url>`,
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
