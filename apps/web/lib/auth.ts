import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

/**
 * Decode le `exp` (epoch seconds) d'un JWT sans le verifier. Utilise pour
 * connaitre la VRAIE expiration plutot que de presumer une valeur (12h/24h)
 * qui peut diverger de la config API et provoquer des deconnexions surprises.
 */
function jwtExpMs(token: string): number | null {
  const obj = decodeJwt(token);
  return obj?.exp ? obj.exp * 1000 : null;
}

function decodeJwt(token: string): { exp?: number; permissions?: string[] } | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    // Compatible Node + Edge runtime
    const json = typeof Buffer !== 'undefined'
      ? Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
      : atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const { handlers, signIn, signOut, auth }: any = NextAuth({
  secret: process.env.AUTH_SECRET,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          const data = await res.json();

          if (!res.ok || !data.success) return null;

          if (data.data.requires2FA) {
            throw new Error('2FA_REQUIRED');
          }

          // On lit la VRAIE date d'expiration depuis le JWT (claim exp)
          // plutot que de la deviner. Evite la divergence si la config API
          // est modifiee.
          const realExp = jwtExpMs(data.data.accessToken);
          if (realExp) {
            const ttlSec = Math.floor((realExp - Date.now()) / 1000);
            // eslint-disable-next-line no-console
            console.log(
              `[Auth.login] token exp=${new Date(realExp).toISOString()} ttl=${ttlSec}s`,
            );
          } else {
            // eslint-disable-next-line no-console
            console.warn('[Auth.login] impossible de decoder exp du JWT');
          }
          // Permissions ABAC : NE SONT PAS stockees ici. Elles vivent dans le claim
          // `permissions` du JWT API (data.data.accessToken) et sont decodees a la
          // demande par usePermission() cote client. Stocker une copie dans la
          // session NextAuth gonflerait inutilement le cookie (limite ~4 kB).
          return {
            id: data.data.user.id,
            email: data.data.user.email,
            name: `${data.data.user.firstName} ${data.data.user.lastName}`,
            role: data.data.user.role,
            agencyIds: data.data.user.agencyIds,
            accessToken: data.data.accessToken,
            refreshToken: data.data.refreshToken,
            // exp reelle depuis le JWT (fallback : 12h si decodage rate)
            accessTokenExpiresAt: realExp ?? Date.now() + 12 * 60 * 60 * 1000,
          };
        } catch (err: any) {
          if (err.message === '2FA_REQUIRED') throw err;
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user, trigger: _trigger, session: _updateInput }) {
      // Note : la branche trigger==='update' a ete retiree. Elle dependait d'un
      // POST cote client vers /api/auth/session?update qui ne pouvait pas
      // inclure le CSRF token requis par NextAuth v5 (cause de l'erreur
      // MissingCSRF dans les logs). Le refresh se fait desormais via la
      // verification naturelle d'expiration ci-dessous (etape 3).
      void _trigger;
      void _updateInput;

      // 1) Initial login : on copie tout depuis l'utilisateur
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.agencyIds = (user as any).agencyIds;
        token.accessToken = (user as any).accessToken;
        token.refreshToken = (user as any).refreshToken;
        token.accessTokenExpiresAt = (user as any).accessTokenExpiresAt;
        return token;
      }

      // 2) Token encore valide (avec marge de 60s) -> on garde
      const now = Date.now();
      const exp = (token as any).accessTokenExpiresAt as number | undefined;
      if (exp && now < exp - 60_000) {
        return token;
      }

      // 3) Token expire ou bientot : tenter refresh via l'API
      const refresh = (token as any).refreshToken as string | undefined;
      if (!refresh) return token;

      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh }),
        });
        const data = await res.json();
        if (res.ok && data?.success) {
          (token as any).accessToken = data.data.accessToken;
          (token as any).refreshToken = data.data.refreshToken;
          const realExp = jwtExpMs(data.data.accessToken);
          (token as any).accessTokenExpiresAt = realExp ?? Date.now() + 12 * 60 * 60 * 1000;
          // Permissions : pas stockees dans le token NextAuth (cf. authorize ci-dessus).
          // Elles seront re-extraites du nouveau accessToken par usePermission().
          (token as any).error = undefined;
          // eslint-disable-next-line no-console
          console.log(
            `[Auth.refresh] token refreshed, new exp=${realExp ? new Date(realExp).toISOString() : 'unknown'}`,
          );
        } else {
          (token as any).error = 'RefreshFailed';
          // eslint-disable-next-line no-console
          console.warn('[Auth.refresh] failed:', data?.message ?? res.status);
        }
      } catch (err) {
        (token as any).error = 'RefreshFailed';
        // eslint-disable-next-line no-console
        console.warn('[Auth.refresh] error:', err);
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      (session as any).role = token.role;
      (session as any).agencyIds = token.agencyIds;
      (session as any).accessToken = (token as any).accessToken;
      (session as any).error = (token as any).error;
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
});
