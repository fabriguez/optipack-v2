'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SocketProvider } from '@/lib/providers/SocketProvider';
import { SessionRefreshBridge } from '@/lib/providers/SessionRefreshBridge';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';

// Tag de build expose en console pour verifier que le bundle deploye est bien
// celui attendu (et non un cache navigateur ou un docker image stale).
// A bumper a chaque correctif important d'auth/scanner.
const BUILD_TAG = 'web@2026-05-08-client-soft-delete-cni-on-create';

export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Affiche le tag de build une seule fois pour faciliter le diagnostic des
    // bugs persistants apres deploiement (cache navigateur / docker stale).
    // eslint-disable-next-line no-console
    console.log(`%c[build] ${BUILD_TAG}`, 'color: #1B5E20; font-weight: bold;');
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
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
    return null;
  }

  return (
    <SocketProvider>
      <SessionRefreshBridge />
      <DashboardLayout>{children}</DashboardLayout>
    </SocketProvider>
  );
}
