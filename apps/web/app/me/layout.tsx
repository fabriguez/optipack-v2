'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { LogOut, UserCircle } from 'lucide-react';
import { useLogout } from '@/lib/hooks/useAuth';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { AppButton } from '@/components/ui/AppButton';
import { authLog } from '@/lib/api/authDebug';

export default function SelfPortalLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { mutate: logout } = useLogout();

  // Grace period 1.5s avant redirect : evite les redirects silencieux sur des
  // transitions transitoires de status (re-hydratation de session).
  const unauthSinceRef = useRef<number | null>(null);
  useEffect(() => {
    if (status !== 'unauthenticated') {
      unauthSinceRef.current = null;
      return;
    }
    if (unauthSinceRef.current == null) unauthSinceRef.current = Date.now();
    const timer = setTimeout(() => {
      if (unauthSinceRef.current == null) return;
      authLog('me-layout.unauthenticated.redirect', {
        graceMs: Date.now() - unauthSinceRef.current,
      });
      router.replace('/login?reason=session-unauthenticated');
    }, 1500);
    return () => clearTimeout(timer);
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-3xl p-8">
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/me" className="flex items-center gap-2 text-base font-semibold text-primary-700">
            <UserCircle className="h-5 w-5" />
            Mon espace
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-gray-600 sm:inline">
              {session?.user?.name ?? session?.user?.email}
            </span>
            <AppButton size="sm" variant="ghost" onClick={() => logout()}>
              <LogOut className="h-4 w-4" />
              Deconnexion
            </AppButton>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
