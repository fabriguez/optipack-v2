'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiClient } from '@/lib/api/client';
import type { SkinCustomization, SkinId } from '@transitsoftservices/skins';

/**
 * Per-tenant public metadata loaded from the API.
 * The API endpoint is the same as the staff app (`/tenant-meta`), but we look
 * for additional `skin` and `skinCustomization` fields if the backend exposes
 * them. Falls back to defaults if missing.
 */
export interface TenantMeta {
  id: string;
  slug: string | null;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  supportEmail: string | null;
  defaultCurrency: string;
  defaultLanguage: string;
  skin?: SkinId;
  skinCustomization?: SkinCustomization;
}

interface Ctx {
  meta: TenantMeta | null;
  loading: boolean;
  /** Force un refetch sans reload (utile apres une action admin). */
  refresh: () => Promise<void>;
}

const TenantMetaContext = createContext<Ctx>({ meta: null, loading: true, refresh: async () => {} });

const REFRESH_INTERVAL_MS = 60_000;

const FALLBACK: TenantMeta = {
  id: 'fallback',
  slug: null,
  name: 'Transit Soft Services',
  logoUrl: null,
  primaryColor: '#1B5E20',
  secondaryColor: '#4CAF50',
  accentColor: '#A5D6A7',
  supportEmail: null,
  defaultCurrency: 'XAF',
  defaultLanguage: 'fr',
};

export function TenantMetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<TenantMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMeta = async () => {
    try {
      const r = await apiClient.get('/tenant-meta');
      setMeta((r.data?.data as TenantMeta) ?? FALLBACK);
    } catch {
      setMeta(FALLBACK);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchMeta().finally(() => {
      if (!cancelled) setLoading(false);
    });

    // Propagation skin/branding sans WebSocket (le portail public ne se
    // connecte pas a socket.io) :
    //   1) refetch au focus de la fenetre (visite revient sur l'onglet)
    //   2) refetch quand l'onglet redevient visible
    //   3) polling lent toutes les 60s pour les sessions longues laissees
    //      ouvertes pendant un changement admin
    const onFocus = () => fetchMeta();
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchMeta();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(fetchMeta, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      meta,
      loading,
      refresh: fetchMeta,
    }),
    [meta, loading],
  );
  return <TenantMetaContext.Provider value={value}>{children}</TenantMetaContext.Provider>;
}

export function useTenantMeta(): Ctx {
  return useContext(TenantMetaContext);
}
