import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/lib/providers/AuthProvider';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { authLog } from '@/lib/api/authDebug';

// Garde d'authentification + grace-period, portee de (dashboard)/layout.tsx.
//
// Le store passe transitoirement 'unauthenticated' pendant la rehydratation
// (secure-store async) ou un re-fetch. Une redirection immediate produirait
// des decos silencieuses. On attend 3s avant de considerer le passage
// definitif, en respectant la visibilite de la fenetre.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const navigate = useNavigate();
  const unauthSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== 'unauthenticated') {
      unauthSinceRef.current = null;
      return;
    }
    if (unauthSinceRef.current == null) {
      unauthSinceRef.current = Date.now();
    }
    const timer = setTimeout(() => {
      if (unauthSinceRef.current == null) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        // Onglet en background : on ne redirige pas, on reverifie au focus.
        return;
      }
      authLog('layout.unauthenticated.redirect', {
        graceMs: Date.now() - unauthSinceRef.current,
        path: typeof window !== 'undefined' ? window.location.pathname : '',
      });
      navigate('/login', { replace: true });
    }, 3000);
    return () => clearTimeout(timer);
  }, [status, navigate]);

  // Pendant le boot (rehydratation) ou la grace-period : skeleton, pas de flash.
  if (status === 'loading' || status === 'unauthenticated') {
    return <DashboardSkeleton />;
  }

  return <>{children}</>;
}
