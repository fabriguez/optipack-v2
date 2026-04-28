'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

export function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <NextAuthSessionProvider
      // Ne pas refetch la session au retour sur l'onglet : sur reseau instable,
      // un fetch echoue et NextAuth deconnecte l'utilisateur. Le JWT etant signe
      // et a maxAge=7j, un refetch frequent n'est pas necessaire.
      refetchOnWindowFocus={false}
      refetchInterval={0}
      refetchWhenOffline={false}
    >
      {children}
    </NextAuthSessionProvider>
  );
}
