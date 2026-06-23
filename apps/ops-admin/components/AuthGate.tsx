'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Me } from '@/lib/useMe';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let me: Me | null = null;
      try {
        me = (await api.get('/auth/me')).data?.data as Me;
      } catch {
        if (!cancelled) router.replace('/login');
        return;
      }
      if (cancelled) return;

      // Compte facturation tenant : confine a sa vue tenant + /me. Toute autre
      // route -> redirige vers son espace. Defense en profondeur au-dessus de
      // l'ABAC backend (les routes globales renvoient deja 403).
      if (me?.tenantId) {
        const allowed =
          path === '/me' ||
          path === `/tenants/${me.tenantId}` ||
          path?.startsWith(`/tenants/${me.tenantId}/`);
        if (!allowed) {
          router.replace(`/tenants/${me.tenantId}`);
          return;
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, path]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Chargement...
      </div>
    );
  }
  return <>{children}</>;
}
