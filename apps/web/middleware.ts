import { NextRequest, NextResponse } from 'next/server';

/**
 * Diagnostic ponctuel : log toute requete POST vers /api/auth/* avec son
 * referer + user-agent + IP, pour identifier la source des erreurs
 * MissingCSRF qui apparaissent dans les logs serveur.
 *
 * A retirer une fois la source identifiee (cache navigateur, health check,
 * ancien onglet, ...).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (req.method === 'POST' && pathname.startsWith('/api/auth/')) {
    const referer = req.headers.get('referer') ?? '(none)';
    const userAgent = req.headers.get('user-agent') ?? '(none)';
    const xff = req.headers.get('x-forwarded-for') ?? '(none)';
    const cookieKeys = req.headers.get('cookie')?.split(';')
      .map((c) => c.trim().split('=')[0])
      .filter(Boolean)
      .join(',') ?? '(none)';
    // eslint-disable-next-line no-console
    console.log(
      `[auth-probe] POST ${pathname} ref=${referer} xff=${xff} cookies=${cookieKeys} ua=${userAgent.slice(0, 80)}`,
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/auth/:path*'],
};
