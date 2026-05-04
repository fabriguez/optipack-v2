import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

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

          return {
            id: data.data.user.id,
            email: data.data.user.email,
            name: `${data.data.user.firstName} ${data.data.user.lastName}`,
            role: data.data.user.role,
            agencyIds: data.data.user.agencyIds,
            accessToken: data.data.accessToken,
            refreshToken: data.data.refreshToken,
            // Pas d'exp explicite renvoye par /auth/login : on suppose 12h (config.jwt.accessExpiry).
            accessTokenExpiresAt: Date.now() + 12 * 60 * 60 * 1000,
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
    async jwt({ token, user, trigger }) {
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
          (token as any).accessTokenExpiresAt = Date.now() + 12 * 60 * 60 * 1000;
          (token as any).error = undefined;
        } else {
          (token as any).error = 'RefreshFailed';
        }
      } catch {
        (token as any).error = 'RefreshFailed';
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
