import type { NextRequest } from 'next/server';
import { getTenantMeta, DEFAULT_DESCRIPTION, PUBLIC_PAGES } from '@/lib/seo';

/**
 * llms.txt — carte du site en markdown pour les moteurs de reponse AI
 * (ChatGPT, Claude, Perplexity, Gemini). Genere depuis le tenant-meta pour
 * porter le nom et le contact du tenant courant.
 * Spec : https://llmstxt.org
 */
export async function GET(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3001';
  const proto = req.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const base = `${proto}://${host}`;

  const meta = await getTenantMeta();
  const name = meta.name?.trim() || 'Transit Soft Services';

  const keyPages = PUBLIC_PAGES.filter((p) =>
    ['/', '/track', '/simulateur', '/agencies', '/about', '/support', '/docs', '/api-docs'].includes(p.path),
  );
  const legalPages = PUBLIC_PAGES.filter((p) => ['/cgv', '/privacy', '/legal'].includes(p.path));

  const lines = [
    `# ${name}`,
    '',
    `> ${DEFAULT_DESCRIPTION}`,
    '',
    `${name} permet de suivre un colis en temps reel a partir de son numero de reference, ` +
      `d'estimer le cout d'un envoi avec le simulateur de tarifs, de payer en ligne et de recevoir ` +
      `des notifications automatiques (email, WhatsApp, SMS, push). Le service est accessible sur le web ` +
      `et via une application mobile iOS et Android.`,
    ...(meta.supportEmail ? ['', `Contact support : ${meta.supportEmail}`] : []),
    '',
    '## Pages principales',
    '',
    ...keyPages.map((p) => `- [${p.title}](${base}${p.path}): ${p.description}`),
    '',
    '## Legal',
    '',
    ...legalPages.map((p) => `- [${p.title}](${base}${p.path}): ${p.description}`),
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
