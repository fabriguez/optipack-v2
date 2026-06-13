'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ModuleGuard } from '@/components/layout/ModuleGuard';
import { PermissionGate } from '@/components/layout/PermissionGate';
import { SocketProvider } from '@/lib/providers/SocketProvider';
import { SessionRefreshBridge } from '@/lib/providers/SessionRefreshBridge';
import { TenantMetaSocketSync } from '@/components/layout/TenantMetaSocketSync';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { authLog } from '@/lib/api/authDebug';

// Tag de build expose en console pour verifier que le bundle deploye est bien
// celui attendu (et non un cache navigateur ou un docker image stale).
// A bumper a chaque correctif important d'auth/scanner.
const BUILD_TAG = 'web@2026-05-13-auth-stabilisation';

export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Affiche le tag de build une seule fois pour faciliter le diagnostic des
    // bugs persistants apres deploiement (cache navigateur / docker stale).
    // eslint-disable-next-line no-console
    console.log(`%c[build] ${BUILD_TAG}`, 'color: #1B5E20; font-weight: bold;');
  }, []);

  // Grace period : NextAuth peut transitoirement passer en 'unauthenticated'
  // pendant le re-fetch de session (Network Information API change, focus
  // window, mutation update, RSC hydration sur Next 16, ...). Une
  // redirection immediate sur la 1ere transition produit des decos
  // silencieuses. On attend 3s avant de considerer le passage definitif :
  // - iOS/Safari peut prendre >2s a re-hydrater apres retour de background ;
  // - Next 16 RSC peut introduire un delai supplementaire sur premiere
  //   navigation.
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
      // Verifie qu'on est TOUJOURS unauthenticated apres la grace + qu'on
      // n'a pas change de visibilite (un retour de focus peut declencher
      // une nouvelle hydration ; on lui donne sa chance).
      if (unauthSinceRef.current == null) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        // L'onglet est en background : on ne redirige pas. On reverifie au
        // prochain status change ou au focus.
        return;
      }
      authLog('layout.unauthenticated.redirect', {
        graceMs: Date.now() - unauthSinceRef.current,
        path: typeof window !== 'undefined' ? window.location.pathname : '',
      });
      router.replace('/login?reason=session-unauthenticated');
    }, 3000);
    return () => clearTimeout(timer);
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-5xl p-8">
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    // Pendant la grace period (1.5s) on affiche le skeleton plutot que null,
    // pour eviter un flash blanc si NextAuth ne fait que re-hydrater.
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-5xl p-8">
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <SocketProvider>
      <SessionRefreshBridge />
      <TenantMetaSocketSync />
      <DashboardLayout>
        <ModuleGuard><PermissionGate>{children}</PermissionGate></ModuleGuard>
      </DashboardLayout>
    </SocketProvider>
  );
}
