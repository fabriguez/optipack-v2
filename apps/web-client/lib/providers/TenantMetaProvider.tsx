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
}

const TenantMetaContext = createContext<Ctx>({ meta: null, loading: true });

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

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get('/tenant-meta')
      .then((r) => {
        if (cancelled) return;
        setMeta((r.data?.data as TenantMeta) ?? FALLBACK);
      })
      .catch(() => {
        if (!cancelled) setMeta(FALLBACK);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ meta, loading }), [meta, loading]);
  return <TenantMetaContext.Provider value={value}>{children}</TenantMetaContext.Provider>;
}

export function useTenantMeta(): Ctx {
  return useContext(TenantMetaContext);
}
