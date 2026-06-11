import { useEffect, useRef, type ReactNode } from 'react';
import { useAuthStore } from '@/lib/auth/authStore';
import { authLog } from '@/lib/api/authDebug';

// Remplace SessionProvider + SessionRefreshBridge de next-auth.
//
//  1) Hydratation : zustand/persist restaure les tokens depuis le stockage et
//     derive le statut (authenticated/unauthenticated) via onRehydrateStorage.
//  2) Refresh proactif sur retour de focus/visibilite : si l'utilisateur
//     revient apres > 25 min, on force un refresh AVANT la 1ere requete API
//     pour eviter le 1er 401 -> redirect (cause #1 des "j'etais parti, je suis
//     deconnecte"). Token backend typiquement 60 min.

const VISIBILITY_REFRESH_THRESHOLD_MS = 25 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const refresh = useAuthStore((s) => s.refresh);
  const lastRefreshAt = useRef<number>(Date.now());

  // Filet de securite : si l'hydratation du secure-store stagne (ex. prompt
  // trousseau sur binaire dev non signe, invoke qui pend), on ne reste pas
  // bloque sur le skeleton. Apres 4s encore en 'loading' -> 'unauthenticated'
  // (RequireAuth redirigera vers /login).
  useEffect(() => {
    const t = setTimeout(() => {
      if (useAuthStore.getState().status === 'loading') {
        authLog('auth.hydration-timeout-forced-unauth');
        useAuthStore.setState({ status: 'unauthenticated' });
      }
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handler = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const { accessToken } = useAuthStore.getState();
      if (!accessToken) return;
      const elapsed = Date.now() - lastRefreshAt.current;
      if (elapsed < VISIBILITY_REFRESH_THRESHOLD_MS) return;
      authLog('visibility.refresh-triggered', { elapsedMs: elapsed });
      try {
        await refresh();
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
  }, [refresh]);

  return <>{children}</>;
}

/** Accesseurs pratiques facon useSession() pour les composants. */
export function useSession() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  return { status, user, accessToken };
}
