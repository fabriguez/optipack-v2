'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

/**
 * Pont entre l'apiClient (non-React) et useSession().update().
 *
 * Pourquoi cette indirection :
 *  - useSession().update(data) est la SEULE facon NextAuth-conforme de
 *    declencher le callback jwt({ trigger: 'update' }), tout en gerant le
 *    token CSRF requis par NextAuth v5 sur /api/auth/session.
 *  - Un raw fetch vers /api/auth/session?update produit "MissingCSRF"
 *    (cf. logs precedents).
 *  - L'apiClient axios n'est pas un composant React, donc il ne peut pas
 *    appeler useSession() directement.
 *
 * Solution : ce composant pose la fonction update() sur window.__forceSession-
 * Refresh. L'apiClient l'appelle quand il detecte un 401 valide localement
 * mais rejete par l'API (revocation serveur, clock skew, redemarrage API).
 */
declare global {
  interface Window {
    __forceSessionRefresh?: () => Promise<unknown>;
  }
}

export function SessionRefreshBridge() {
  const { update } = useSession();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__forceSessionRefresh = async () => {
      // Le payload { forceRefresh: true } sera lu dans auth.ts -> jwt callback
      // -> trigger='update' -> reset de accessTokenExpiresAt -> appel /auth/refresh.
      return update({ forceRefresh: true });
    };
    return () => {
      delete window.__forceSessionRefresh;
    };
  }, [update]);

  return null;
}
