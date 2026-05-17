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
  // Multi-tenant : le host arrive depuis Caddy en proxy (X-Forwarded-Host =
  // app.<slug>.<base>) et NextAuth v5 refuse par defaut tous les hosts non
  // listes -> UntrustedHost. On fait confiance au reverse proxy (Caddy
  // valide deja le SAN du cert via Let's Encrypt). Override possible via
  // AUTH_TRUST_HOST=false en env si proxy non-fiable.
  trustHost: process.env.AUTH_TRUST_HOST !== 'false',
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('MISSING_FIELDS');
        }

        // Etape 1 : reseau. On differencie "API injoignable" d'un "mauvais
        // mot de passe" pour pouvoir afficher le bon message cote UI.
        let res: Response;
        try {
          res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });
        } catch (err: any) {
          // eslint-disable-next-line no-console
          console.error('[Auth.login] network error', err?.message);
          throw new Error('NETWORK_ERROR');
        }

        let data: any = null;
        try {
          data = await res.json();
        } catch {
          /* reponse non-JSON : on tombera dans le branche d'erreur ci-dessous */
        }

        // Etape 2 : statut HTTP. 401/422 = creds invalides, 5xx = API en
        // erreur, autre = inconnu. Tous typees.
        if (!res.ok || !data?.success) {
          if (res.status === 401 || res.status === 422) {
            throw new Error('INVALID_CREDENTIALS');
          }
          if (res.status >= 500) {
            throw new Error('SERVER_ERROR');
          }
          throw new Error('UNKNOWN_ERROR');
        }

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
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user, trigger, session: updateInput }) {
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

      // 2) Force-refresh declenche par le client via useSession().update(...).
      // Toute mise a jour cote client passe par SessionRefreshBridge qui demande
      // un refresh -- on force donc la rotation des que trigger === 'update',
      // sans dependre du payload `forceRefresh`. Ce payload n'est pas propage
      // de maniere fiable jusqu'au callback dans NextAuth v5 beta + Next 16,
      // ce qui laissait `accessTokenExpiresAt` dans le futur et faisait que le
      // callback retournait le token inchange (symptome : 401-after-refresh
      // boucle avec le meme accessToken jusqu'a redirect vers /login).
      if (trigger === 'update') {
        (token as any).accessTokenExpiresAt = 0;
        // On purge aussi l'eventuel `error` precedent : un blip API ne doit pas
        // empoisonner les refresh suivants si l'API est revenue.
        (token as any).error = undefined;
      }

      // 3) Token encore valide (avec marge de 60s) -> on garde
      const now = Date.now();
      const exp = (token as any).accessTokenExpiresAt as number | undefined;
      if (exp && now < exp - 60_000) {
        return token;
      }

      // 4) Token expire (naturellement OU force par l'etape 2) : appel /auth/refresh.
      const refresh = (token as any).refreshToken as string | undefined;
      if (!refresh) return token;

      // Retry doux : 2 tentatives avec backoff. Un seul blip reseau ne doit
      // pas suffire a poser 'RefreshFailed' qui condamnait l'utilisateur
      // jusqu'au re-login. Total max ~1.5s d'attente.
      let lastErr: unknown = null;
      let success = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: refresh }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data?.success && data?.data?.accessToken) {
            (token as any).accessToken = data.data.accessToken;
            (token as any).refreshToken = data.data.refreshToken ?? refresh;
            const realExp = jwtExpMs(data.data.accessToken);
            (token as any).accessTokenExpiresAt =
              realExp ?? Date.now() + 12 * 60 * 60 * 1000;
            (token as any).error = undefined;
            // eslint-disable-next-line no-console
            console.log(
              `[Auth.refresh] token refreshed (attempt ${attempt + 1}), exp=${
                realExp ? new Date(realExp).toISOString() : 'unknown'
              }`,
            );
            success = true;
            break;
          }
          // Distingue les erreurs definitives (401/403 : refresh token revoque)
          // des erreurs transitoires (5xx, 502, 503).
          const status = res.status;
          if (status === 401 || status === 403) {
            (token as any).error = 'RefreshFailed';
            // eslint-disable-next-line no-console
            console.warn(`[Auth.refresh] definitif ${status} : token revoque`);
            return token;
          }
          lastErr = `HTTP ${status} : ${data?.message ?? 'erreur serveur'}`;
        } catch (err) {
          lastErr = err;
        }
        // Petit delai avant retry (200ms puis 800ms total).
        if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
      }

      if (!success) {
        // SOFT-FAIL : on N'ECRIT PAS 'error=RefreshFailed' tant que le
        // refresh token n'a pas ete explicitement rejete (401/403). Un
        // serveur indisponible ne doit pas condamner la session : on
        // laisse l'accessToken expire en place ; les requetes API echoueront
        // mais le client pourra retenter et le PROCHAIN trigger ou
        // expiration relancera un refresh. C'est exactement ce qu'il faut
        // pour traverser un redeploiement API ou un blip reseau prolonge.
        // eslint-disable-next-line no-console
        console.warn(
          `[Auth.refresh] echec transitoire, on garde la session : ${String(lastErr)}`,
        );
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
