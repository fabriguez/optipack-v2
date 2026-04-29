'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/api';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isAuthenticated();
      if (cancelled) return;
      if (!ok) router.replace('/login');
      else setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);
  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Chargement...
      </div>
    );
  }
  return <>{children}</>;
}
