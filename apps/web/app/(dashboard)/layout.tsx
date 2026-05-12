'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SocketProvider } from '@/lib/providers/SocketProvider';
import { SessionRefreshBridge } from '@/lib/providers/SessionRefreshBridge';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { authLog } from '@/lib/api/authDebug';

// Tag de build expose en console pour verifier que le bundle deploye est bien
// celui attendu (et non un cache navigateur ou un docker image stale).
// A bumper a chaque correctif important d'auth/scanner.
const BUILD_TAG = 'web@2026-05-12-bordereaux-post-unload';

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
  // window, mutation update, ...). Une redirection immediate sur la 1ere
  // transition produit des decos silencieuses. On attend 1.5s avant de
  // considerer le passage definitif, ce qui laisse le temps a NextAuth de
  // re-hydrater la session si le cookie est encore valide.
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
      // Verifie qu'on est TOUJOURS unauthenticated apres la grace.
      if (unauthSinceRef.current == null) return;
      authLog('layout.unauthenticated.redirect', {
        graceMs: Date.now() - unauthSinceRef.current,
        path: typeof window !== 'undefined' ? window.location.pathname : '',
      });
      router.replace('/login?reason=session-unauthenticated');
    }, 1500);
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
      <DashboardLayout>{children}</DashboardLayout>
    </SocketProvider>
  );
}
