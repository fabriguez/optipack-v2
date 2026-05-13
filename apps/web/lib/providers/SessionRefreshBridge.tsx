'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { authLog } from '@/lib/api/authDebug';

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
 *
 * Effet bord : refresh PROACTIF quand l'onglet revient au premier plan
 * apres une periode prolongee. Cause #1 des "j'etais parti, je suis
 * deconnecte" : le token expire en arriere-plan, le browser bloque
 * souvent les fetch background, le premier click au retour tape un 401
 * et embarque la session.
 */
declare global {
  interface Window {
    __forceSessionRefresh?: () => Promise<unknown>;
  }
}

// Seuil au-dela duquel un retour au premier plan declenche un refresh
// preventif. 25 min : suffisamment court pour devancer la plupart des
// expirations (token backend typiquement 60 min), assez long pour ne pas
// refresh inutilement a chaque alt-tab.
const VISIBILITY_REFRESH_THRESHOLD_MS = 25 * 60 * 1000;

export function SessionRefreshBridge() {
  const { update, data: session } = useSession();
  const lastRefreshAt = useRef<number>(Date.now());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__forceSessionRefresh = async () => {
      // Le payload { forceRefresh: true } sera lu dans auth.ts -> jwt callback
      // -> trigger='update' -> reset de accessTokenExpiresAt -> appel /auth/refresh.
      const r = await update({ forceRefresh: true });
      lastRefreshAt.current = Date.now();
      return r;
    };
    return () => {
      delete window.__forceSessionRefresh;
    };
  }, [update]);

  // Refresh proactif sur retour de focus / visibilite. Si le user revient
  // sur l'onglet apres > 25 min, on force un refresh AVANT meme la 1ere
  // requete API, pour eviter le 1er 401 -> redirect.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = async () => {
      if (document.visibilityState !== 'visible') return;
      if (!session) return;
      const elapsed = Date.now() - lastRefreshAt.current;
      if (elapsed < VISIBILITY_REFRESH_THRESHOLD_MS) return;
      authLog('visibility.refresh-triggered', { elapsedMs: elapsed });
      try {
        await update({ forceRefresh: true });
        lastRefreshAt.current = Date.now();
      } catch (e) {
        authLog('visibility.refresh-failed', { err: String(e) });
      }
    };
    document.addEventListener('visibilitychange', handler);
    window.addEventListener('focus', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('focus', handler);
    };
  }, [update, session]);

  return null;
}
